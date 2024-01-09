import got from 'got';
import querystring from 'querystring';
import dotenv from 'dotenv';
dotenv.config();
import cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { parse, setYear, format, addMonths, startOfToday, getDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import cron from 'node-cron';
import { google } from 'googleapis';
const { auth } = require('google-auth-library');

const SERVICE_ACCOUNT_FILE = './secret.json';

const authClient = auth.fromJSON(require(SERVICE_ACCOUNT_FILE));
authClient.scopes = ['https://www.googleapis.com/auth/calendar'];

const calendar = google.calendar({ version: 'v3', auth: authClient });

const supabaseUrl = process.env.URL_SUPABASE;
const supabaseKey = process.env.KEY_SUPABASE;
const supabase = createClient(supabaseUrl, supabaseKey);

const oldcookies = 'org.springframework.web.servlet.i18n.CookieLocaleResolver.LOCALE=fr-FR';

async function fetchSchedule(username, password, profSplitString, classeMatchString, webhook) {

    const postData = querystring.stringify({
        'username': username,
        'password': password,
        '_eventId': 'submit',
        'execution': process.env.EXECUTION_TOKEN
    });

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
                await processTicket(ticket, profSplitString, classeMatchString, webhook);
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

async function processTicket(ticket, profSplitString, classeMatchString, webhook) {
    const combinedCookies = oldcookies + '; ' + ticket;

    const today = startOfToday();
    const oneMonthsLater = addMonths(today, 1);
    
    const tuesdays = getTuesdays(today, oneMonthsLater); 

    const nextFourTuesdays = tuesdays.slice(0, 5);

    for (const tuesday of nextFourTuesdays) {
        const formattedDate = format(tuesday, 'MM/dd/yyyy');
        const url = `https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?action=posEDTLMS&date=${formattedDate}`;

        try {
            const response = await got.get(url, {
                headers: {
                    'Cookie': combinedCookies
                },
            });
            await processResponse(response, profSplitString, classeMatchString, webhook);
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

async function processResponse(response, profSplitString, classeMatchString, webhook) {
    const html = response.body;
    const $ = cheerio.load(html);
    const today = startOfToday();
    let thisThursday = today;
    if (getDay(today) !== 4) { 
        thisThursday = addDays(today, (4 - getDay(today) - 7) % 7);
    }

    let nextThursday = addDays(thisThursday, 7);

    const joursInfo = {};
    $('.Jour').each(function() {
        const leftValue = parseFloat($(this).css('left').replace('%', ''));
        const dateText = $(this).find('.TCJour').text().trim();
        joursInfo[leftValue] = parseFrenchDate(dateText);
    });

    $('.Case').each(async function() {
        let isExactMatch = false;
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
            let prof = profText.split(profSplitString)[0].trim() || 'Prof non spécifié';
            let classeRegex = new RegExp(`(${classeMatchString})$`);
            let classe = profText.match(classeRegex) ? profText.match(classeRegex)[0] : 'Info supplémentaire non spécifiée';

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
            let eventToDiscord = [];
            data.forEach(existingEvent => {
                const existingStart = new Date(`${formattedDate} ${existingEvent.startTime}`);
                const existingEnd = new Date(`${formattedDate} ${existingEvent.endTime}`);
            
                if (startDateTime.getTime() === existingStart.getTime() && 
                    endDateTime.getTime() === existingEnd.getTime() && 
                    salle === existingEvent.salle && 
                    matiere === existingEvent.matiere && 
                    prof === existingEvent.prof && 
                    classe === existingEvent.classe) {
                    isExactMatch = true;
                }
            
                if (((startDateTime >= existingStart && startDateTime < existingEnd) ||
                    (endDateTime > existingStart && endDateTime <= existingEnd) ||
                    (startDateTime <= existingStart && endDateTime >= existingEnd)) &&
                    classe === existingEvent.classe) {
                    eventsToDelete.push(existingEvent.id);
                    eventToDiscord.push(existingEvent.startTime, " à ", existingEvent.endTime);
                }
            });

        if (isExactMatch) {
            console.log('Même horaires. Aucun changement');
        } else {
            if (eventsToDelete.length > 0) {
                await supabase
                    .from('EDT')
                    .delete()
                    .in('id', eventsToDelete);

                console.log('Horaire modifié. Anciens événements supprimés.', eventsToDelete, endDateTime, startDateTime, dateOfCourse);

                const DateCours = format(dateOfCourse, "EEEE dd MMMM", { locale: fr });

                fetch(webhook , {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        "embeds": [
                            {
                              "title": "Modification d'un horaire !",
                              "description": `Le ${DateCours} de ${eventToDiscord.join("")} => ${startTime} à ${endTime} `,
                              "color": 5814783
                            },
                        ]
                    }),
                })
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

                let eventDate = new Date(formattedDate);
                if (eventDate >= thisThursday && eventDate < nextThursday) {
                    fetch(webhook , {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            "embeds": [
                                {
                                  "title": "Nouvel événement programmé pour la semaine prochaine",
                                  "description": `Un nouvel événement a été ajouté pour le ${format(eventDate, "EEEE dd MMMM", { locale: fr })}.`,
                                  "color": 5814783
                                }
                            ]
                        }),
                    });
                }
            }
        }
 } });
}

// async function executeFetchSchedule() {
//     await fetchSchedule(process.env.USERNAMECDA, process.env.PASSWORDCDA, 'BACHELOR', 'BACHELOR.*', process.env.WEBHOOKCDA);
//     await fetchSchedule(process.env.USERNAMEASRBD, process.env.PASSWORDASRBD, 'BACHELOR', 'BACHELOR.*', process.env.WEBHOOKASRBD);
//     await fetchSchedule(process.env.USERNAMEWIS, process.env.PASSWORDWIS, 'Cours', 'Cours.*', process.env.WEBHOOKWIS);
// }

// cron.schedule('0 18 * * *', () => {
//     console.log('Exécution de executeFetchSchedule à 18h chaque jour.');
//     executeFetchSchedule();
// }, {
//     scheduled: true,
//     timezone: "Europe/Paris" 
// });

await fetchSchedule(process.env.USERNAMECDA, process.env.PASSWORDCDA, 'BACHELOR', 'BACHELOR.*', process.env.WEBHOOK);
await fetchSchedule(process.env.USERNAMEASRBD, process.env.PASSWORDASRBD, 'BACHELOR', 'BACHELOR.*', process.env.WEBHOOK);
await fetchSchedule(process.env.USERNAMEWIS, process.env.PASSWORDWIS, 'Cours', 'Cours.*', process.env.WEBHOOK);