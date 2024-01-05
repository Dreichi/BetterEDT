import {
  redirect,
  type LoaderFunction,
  type LoaderFunctionArgs,
  json,
  ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  createBrowserClient,
  createServerClient,
} from "@supabase/auth-helpers-remix";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Navbar from "../components/navbar";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import fr from "date-fns/locale/fr";

const messages = {
  allDay: "Tous les jours",
  previous: "Précédent",
  next: "Suivant",
  today: "Aujourd'hui",
  month: "Mois",
  week: "Semaine",
  day: "Jour",
  agenda: "Agenda",
  date: "Date",
  time: "Heure",
  event: "Evenement",
};
const locales = {
  fr: fr,
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export const loader: LoaderFunction = async ({
  request,
}: LoaderFunctionArgs) => {
  const response = new Response();
  const api = {
    supabaseUrl: process.env.URL_SUPABASE,
    supabaseKey: process.env.KEY_SUPABASE,
  };
  const supabase = createServerClient(
    process.env.URL_SUPABASE!,
    process.env.KEY_SUPABASE!,
    { request, response }
  );
  let sessionResult = await supabase.auth.getSession();
  if (sessionResult.data.session === null) {
    return redirect("/");
  }
  const userId = sessionResult.data.session.user.id;
  //   const { data: Tickets, error } = await supabase
  //     .from("Client")
  //     .select()
  //     .eq("user", userId);
  //   if (error) {
  //     console.error(error);
  //     throw new Error("Erreur lors de la récupération");
  //   }

  return json({
    api,
    // Tickets,
    sessionResult,
  });
};

interface UpdateUserData {
  email?: string;
  password?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("test");
  const formData = await request.formData();
  const response = new Response();

  const newEmail = formData.get("email");
  const newPassword = formData.get("password");

  const email = typeof newEmail === "string" ? newEmail : undefined;
  const password = typeof newPassword === "string" ? newPassword : undefined;

  const supabase = createServerClient(
    process.env.URL_SUPABASE!,
    process.env.KEY_SUPABASE!,
    { request, response }
  );

  let sessionResult = await supabase.auth.getSession();
  const useremail = sessionResult.data.session?.user.email;
  console.log(useremail);
  console.log(email);
  let updateData: UpdateUserData = {};

  if (email === useremail && password) {
    updateData = { password: password };
  } else {
    if (email) updateData.email = email;
    if (password) updateData.password = password;
  }

  const { data, error } = await supabase.auth.updateUser(updateData);
  console.log(data);
  if (error) {
    console.error(error);
    throw new Error("Erreur lors de la récupération");
  }

  return redirect("/dashboard");
}

interface LoaderData {
  api: {
    supabaseUrl: string;
    supabaseKey: string;
  };
}

interface TimetableEvent {
  id: number;
  created_at: string;
  startTime: string;
  endTime: string;
  salle: string;
  prof: string;
  classe: string;
  matiere: string;
  dateOfCourse: string;
}

interface CalendarEvent {
  start: Date;
  end: Date;
  title: string;
  salle: string;
}

export default function Index() {
  const navigate = useNavigate();
  const { api } = useLoaderData<LoaderData>();
  const [supabase] = useState(() =>
    createBrowserClient(api.supabaseUrl, api.supabaseKey)
  );

  const [selectedClass, setSelectedClass] = useState<string>("");
  const [classes, setClasses] = useState<string[]>([]);
  const [timetable, setTimetable] = useState<TimetableEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { data, error } = await supabase.from("EDT").select("classe");

        if (error) throw error;

        const uniqueClasses = Array.from(
          new Set(data.map((item) => item.classe))
        );
        setClasses(uniqueClasses);

        if (uniqueClasses.length > 0) {
          setSelectedClass(uniqueClasses[0]);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des classes", error);
      }
    };

    fetchClasses();
  }, [supabase]);

  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        const { data, error } = await supabase
          .from("EDT")
          .select("*")
          .eq("classe", selectedClass);

        if (error) throw error;
        setTimetable(data);
        setCalendarEvents(transformDataForCalendar(data));
      } catch (error) {
        console.error(
          "Erreur lors de la récupération de l'emploi du temps",
          error
        );
      }
    };

    if (selectedClass) {
      fetchTimetable();
    }
  }, [selectedClass, supabase]);

  const transformDataForCalendar = (
    data: TimetableEvent[]
  ): CalendarEvent[] => {
    return data.map((item) => {
      const startDateTime = item.dateOfCourse + "T" + item.startTime + ":00";
      const endDateTime = item.dateOfCourse + "T" + item.endTime + ":00";

      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error("Invalid date found", item);
      }

      return {
        start: startDate,
        end: endDate,
        title: item.matiere + " - " + item.prof,
        salle: item.salle,
      };
    });
  };

  function CustomToolbar({
    onNavigate,
    label,
  }: {
    onNavigate: Function;
    label: string;
  }) {
    return (
      <div className="rbc-toolbar">
        <span className="rbc-btn-group">
          <button type="button" onClick={() => onNavigate("PREV")}>
            Précédent
          </button>
          <span className="rbc-toolbar-label">{label}</span>
          <button type="button" onClick={() => onNavigate("NEXT")}>
            Suivant
          </button>
        </span>
      </div>
    );
  }

  function CustomEvent({ event }: { event: any }) {
    return (
      <span>
        <h1 className="font-bold">{event.title}</h1>
        <p className="absolute bottom-2"> {event.salle}</p>
      </span>
    );
  }

  return (
    <div className="flex h-screen">
      <div className="hidden lg:flex">
        <Navbar />
      </div>
      <div className="flex-grow flex flex-col p-10">
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="mb-4"
        >
          {classes.map((classe, index) => (
            <option key={index} value={classe}>
              {classe}
            </option>
          ))}
        </select>
        <div className="hidden lg:flex">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            defaultView="week"
            style={{ height: "100%" }}
            culture="fr"
            messages={messages}
            className="flex-grow "
            min={new Date(0, 0, 0, 5, 0, 0)}
            max={new Date(0, 0, 0, 20, 0, 0)}
            components={{
              event: CustomEvent,
            }}
          />
        </div>
        <div className="flex lg:hidden calendar-mobile-view">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            defaultView="day"
            style={{ height: "100%" }}
            culture="fr"
            messages={messages}
            className="flex-grow "
            min={new Date(0, 0, 0, 5, 0, 0)}
            max={new Date(0, 0, 0, 20, 0, 0)}
            components={{
              toolbar: CustomToolbar,
              event: CustomEvent,
            }}
          />
        </div>
      </div>
    </div>
  );
}
