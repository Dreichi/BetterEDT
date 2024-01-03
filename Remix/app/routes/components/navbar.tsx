import { Sidebar } from "flowbite-react";
import { Button, Modal } from "flowbite-react";
import { List, User, Settings, Import } from "lucide-react";
import {
  redirect,
  LoaderFunction,
  LoaderFunctionArgs,
  json,
  ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { createBrowserClient } from "@supabase/auth-helpers-remix";
import { useState, CSSProperties } from "react";
import toast from "react-hot-toast";
import { createServerClient, parse, serialize } from "@supabase/ssr";

interface LoaderData {
  api: {
    supabaseUrl: string | undefined;
    supabaseKey: string | undefined;
  };
  sessionResult: any;
}

export const loader: LoaderFunction = async ({
  request,
}: LoaderFunctionArgs): Promise<ReturnType<typeof json>> => {
  const cookies = parse(request.headers.get("Cookie") ?? "");
  const headers = new Headers();
  const api = {
    supabaseUrl: process.env.URL_SUPABASE,
    supabaseKey: process.env.KEY_SUPABASE,
  };
  const supabase = createServerClient(
    process.env.URL_SUPABASE!,
    process.env.KEY_SUPABASE!,
    {
      cookies: {
        get(key) {
          return cookies[key];
        },
        set(key, value, options) {
          headers.append("Set-Cookie", serialize(key, value, options));
        },
        remove(key, options) {
          headers.append("Set-Cookie", serialize(key, "", options));
        },
      },
    }
  );
  let sessionResult = await supabase.auth.getSession();
  if (sessionResult.data.session === null) {
    return redirect("/login");
  }

  return json({
    api,
    sessionResult,
  });
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const list = formData.get("list");
  const cookies = parse(request.headers.get("Cookie") ?? "");
  const headers = new Headers();

  const supabase = createServerClient(
    process.env.URL_SUPABASE!,
    process.env.KEY_SUPABASE!,
    {
      cookies: {
        get(key) {
          return cookies[key];
        },
        set(key, value, options) {
          headers.append("Set-Cookie", serialize(key, value, options));
        },
        remove(key, options) {
          headers.append("Set-Cookie", serialize(key, "", options));
        },
      },
    }
  );
}

export default function Navbar({}) {
  const navigate = useNavigate();
  const { api, sessionResult } = useLoaderData<LoaderData>();
  const [supabase] = useState(() =>
    createBrowserClient(api.supabaseUrl!, api.supabaseKey!)
  );
  const [openModal, setOpenModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [zoneHover, setZoneHover] = useState(false);

  const signOut = () => {
    supabase.auth.signOut().then(() => {
      toast.success("Déconnexion réussi");
      navigate("/");
    });
  };

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files ? e.target.files[0] : null);

    if (file) {
      const fileReader = new FileReader();

      fileReader.onload = function (event) {
        if (event.target) {
          console.log(
            "Type de event.target.result:",
            typeof event.target.result
          );

          if (typeof event.target.result === "string") {
            setFileContent(event.target.result);
          } else {
            setFileContent(null);
          }
        } else {
          console.log("event.target est null");
          setFileContent(null);
        }
      };

      fileReader.onerror = function (error) {
        console.log("Erreur de lecture de fichier:", error);
      };

      fileReader.readAsText(file);
      console.log(fileContent);
    }
  };

  return (
    <Sidebar aria-label="Sidebar" className="h-screen ">
      <div className="flex flex-col justify-between h-full pt-10">
        <div>
          <Sidebar.Items>
            <Sidebar.ItemGroup>
              {/* <Sidebar.Item href="#" icon={List}>
                Dashboard
              </Sidebar.Item>
              <Sidebar.Item href="#" icon={User}>
                Utilisateurs
              </Sidebar.Item>*/}
              <Sidebar.Item href="#" icon={Settings}>
                Coming Soon
              </Sidebar.Item>
            </Sidebar.ItemGroup>
          </Sidebar.Items>
        </div>
        <div className="mb-2">
          <Button className="w-full" onClick={signOut} color="red">
            Déconnexion
          </Button>
        </div>
      </div>
    </Sidebar>
  );
}
