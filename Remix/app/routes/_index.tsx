import {
  json,
  redirect,
  type LoaderFunction,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { createServerClient } from "@supabase/auth-helpers-remix";
import toast from "react-hot-toast";
import "react-big-calendar/lib/css/react-big-calendar.css";

export const loader: LoaderFunction = async ({
  request,
}: LoaderFunctionArgs) => {
  const response = new Response();
  const supabase = createServerClient(
    process.env.URL_SUPABASE!,
    process.env.KEY_SUPABASE!,
    { request, response }
  );
  const { data } = await supabase.auth.getSession();
  const api = {
    supabaseUrl: process.env.URL_SUPABASE,
    supabaseKey: process.env.KEY_SUPABASE,
  };
  if (data.session !== null) {
    return redirect("/dashboard");
  }
  return json(
    {
      api: api,
    },
    {
      headers: response.headers,
    }
  );
};

export default function Index() {
  const { api } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  const [supabase] = useState(() =>
    createBrowserClient(api.supabaseUrl!, api.supabaseKey!)
  );

  const signIn = async (event: any) => {
    event.preventDefault();

    const email = event.target.email.value;
    const password = event.target.password.value;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;
      navigate("/dashboard");
      toast.success("Connexion réussie");
    } catch (error) {
      toast.error("Email ou mot de passe incorrecte");
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://better-edt.vercel.app/auth/callback",
      },
    });
  };

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Bienvenue sur l'emploi du temps de l'EPSI d'Arras{" "}
        </h2>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <button
          onClick={handleGoogleLogin}
          className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Se connecter avec google
        </button>
      </div>
    </div>
  );
}
