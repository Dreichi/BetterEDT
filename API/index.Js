import got from 'got';
import querystring from 'querystring';
import dotenv from 'dotenv';
dotenv.config();
import cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { parse, setYear, format, addMonths, startOfToday, getDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import cron from 'node-cron';

cron.schedule('0 18 * * *', () => {
    console.log('Exécution de fetchSchedule à 18h chaque jour.');
    fetchSchedule();
}, {
    scheduled: true,
    timezone: "Europe/Paris" 
});


const postData = querystring.stringify({
    'username': "damien.jenger",
    'password': process.env.PASSWORD,
    '_eventId': 'submit',
    'execution': process.env.EXECUTION_TOKEN
});

const supabaseUrl = process.env.URL_SUPABASE;
const supabaseKey = process.env.KEY_SUPABASE;
const supabase = createClient(supabaseUrl, supabaseKey);

const oldcookies = 'org.springframework.web.servlet.i18n.CookieLocaleResolver.LOCALE=fr-FR';

async function fetchSchedule() {

    console.log(process.env.USERNAME)
    try {
        const response = await got.post('https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?action=posEDTLMS&serverID=C', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': oldcookies
            },
            body: postData,
            maxRedirects: 200
        });

        processResponse(response);
    } catch (error) {
        if (error.response) {
            const cookies = error.response.headers['set-cookie'];
            const ticket = cookies.find(cookie => cookie.startsWith('.DotNetCasClientAuth='));
            if (ticket) {
                await processTicket(ticket);
            } else {
                console.error('Ticket non trouvé dans l\'URL');
                console.log(error.response.headers)
            }
        } else {
            console.error('Erreur non gérée:', error);
        }
    }
}

function getTuesdays(start, end) {
    let date = start;
    let tuesdays = [];

    while (getDay(date) !== 2) {
        date = addDays(date, 1);
    }

    while (date <= end) {
        tuesdays.push(date);
        date = addDays(date, 7);
    }

    return tuesdays;
}

async function processTicket(ticket) {
    const combinedCookies = oldcookies + '; ' + ticket;

    const today = startOfToday();
    const oneMonthsLater = addMonths(today, 1);
    
    const tuesdays = getTuesdays(today, oneMonthsLater); 

    const nextFourTuesdays = tuesdays.slice(0, 4);
        
    for (const tuesday of nextFourTuesdays) {
        const formattedDate = format(tuesday, 'MM/dd/yyyy');
        const url = `https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?action=posEDTLMS&date=${formattedDate}`;

        try {
            const response = await got.get(url, {
                headers: {
                    'Cookie': combinedCookies
                },
            });
            await processResponse(response);
        } catch (error) {
            console.error('Erreur lors de la requête GET:', error);
        }
    }
}

function parseFrenchDate(dateStr) {
    const trimmedDateStr = dateStr.replace(/^[^\s]+\s/, ''); 
    let date = parse(trimmedDateStr, 'dd MMMM', new Date(), { locale: fr }); 

    date = setYear(date, new Date().getFullYear());

    return date;
}

async function processResponse(response) {
    const html = response.body;
    const $ = cheerio.load(html);

    const joursInfo = {};
    $('.Jour').each(function() {
        const leftValue = parseFloat($(this).css('left').replace('%', ''));
        const dateText = $(this).find('.TCJour').text().trim();
        joursInfo[leftValue] = parseFrenchDate(dateText);
    });

    $('.Case').each(async function() {
        const caseLeftValue = parseFloat($(this).css('left').replace('%', ''));
        let closestJourLeftValue = null;
        let minDifference = 2; 

        for (const [jourLeftValue, dateOfCourse] of Object.entries(joursInfo)) {
            const difference = Math.abs(jourLeftValue - caseLeftValue);
            if (difference < minDifference) {
                minDifference = difference;
                closestJourLeftValue = jourLeftValue;
            }
        }

        if (closestJourLeftValue != null) {
            const dateOfCourse = joursInfo[closestJourLeftValue];
            const formattedDate = format(dateOfCourse, 'yyyy-MM-dd');

            let horaires = $(this).find('.TChdeb').text().trim() || 'Horaire non spécifié';
            let [startTime, endTime] = horaires.split(' - ').map(s => s.trim());
            let salle = $(this).find('.TCSalle').text().trim() || 'Salle non spécifiée';
            let matiere = $(this).find('td.TCase').text().trim() || 'Matière non spécifiée';
            let profText = $(this).find('.TCProf').text().trim();
            let prof = profText.replace(/([A-Z]{2,}|[A-Z][0-9]).*$/, '').trim() || 'Prof non spécifié';
            let classe = profText.match(/(BACHELOR\s[0-9]\s[CDA].*)$/) ? profText.match(/(BACHELOR\s[0-9]\s[CDA].*)$/)[0] : 'Info supplémentaire non spécifiée';

            const startDateTime = new Date(`${formattedDate} ${startTime}`);
            const endDateTime = new Date(`${formattedDate} ${endTime}`);

            const { data, error } = await supabase
                .from('EDT')
                .select('*')
                .eq('dateOfCourse', formattedDate);

            if (error) {
                console.log('Erreur lors de la récupération des données:', error);
                return;
            }

            let eventsToDelete = [];
            data.forEach(existingEvent => {
                const existingStart = new Date(`${formattedDate} ${existingEvent.startTime}`);
                const existingEnd = new Date(`${formattedDate} ${existingEvent.endTime}`);

                if ((startDateTime >= existingStart && startDateTime < existingEnd) ||
                    (endDateTime > existingStart && endDateTime <= existingEnd) ||
                    (startDateTime <= existingStart && endDateTime >= existingEnd)) {
                    eventsToDelete.push(existingEvent.id);
                }
            });

            if (eventsToDelete.length > 0) {
                await supabase
                    .from('EDT')
                    .delete()
                    .in('id', eventsToDelete);

                console.log('Événements en conflit supprimés.');
            }

            const { error: insertError } = await supabase
                .from('EDT')
                .upsert([
                    { dateOfCourse: formattedDate, startTime, endTime, salle, matiere, prof, classe }
                ]);

            if (insertError) {
                console.log('Erreur lors de l\'insertion:', insertError);
            } else {
                console.log('Nouvel événement inséré !');
            }
        }
    });
}
