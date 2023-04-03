"use client";
import React, {
  ReactNode,
  startTransition,
  use,
  useEffect,
  useMemo,
} from "react";
import { createFromFetch } from "react-server-dom-webpack/client.browser";

const RouterContext = React.createContext<{
  navigate: (url: string) => void;
  refresh: () => void;
} | null>(null);

const UrlContext = React.createContext<string | null>(null);

type Thenable<T> = {
  then: (
    onFulfilled: (value: T) => void,
    onRejected: (reason: unknown) => void
  ) => void;
};

declare module "react" {
  function use<T>(value: Context<T> | Thenable<T>): T;
}

export function Router(props: {
  initialUrl: string;
  initialData: Thenable<ReactNode>;
}) {
  const [url, setUrl] = React.useState(props.initialUrl);
  const [cache, setCache] = React.useState(
    () => new Map([[props.initialUrl, props.initialData]])
  );

  const router = useMemo(
    () => ({
      navigate(url: string) {
        const newUrl = new URL(url, window.location.href);
        if (newUrl.origin !== window.location.origin) {
          window.location.href = newUrl.toString();
          return;
        }
        window.history.pushState(null, "", newUrl);
        startTransition(() => {
          setUrl(newUrl.toString());
        });
      },
      refresh() {
        startTransition(() => {
          setCache(new Map());
        });
      },
    }),
    []
  );
  useEffect(() => {
    const handleNavigate = () => {
      startTransition(() => {
        setUrl(window.location.href);
      });
    };
    window.addEventListener("popstate", handleNavigate);
    return () => {
      window.removeEventListener("popstate", handleNavigate);
    };
  }, []);
  if (!cache.has(url)) {
    cache.set(
      url,
      createFromFetch(fetch(url, { headers: { accept: "text/x-component" } }))
    );
  }
  return (
    <RouterContext.Provider value={router}>
      <UrlContext.Provider value={url}>
        {use(cache.get(url)!)}
      </UrlContext.Provider>
    </RouterContext.Provider>
  );
}

export function useUrl() {
  const url = React.useContext(UrlContext);
  if (url === null) {
    throw new Error("useUrl must be used within a <Router>");
  }
  return url;
}

export function useRouter() {
  const router = React.useContext(RouterContext);
  if (router === null) {
    throw new Error("useRouter must be used within a <Router>");
  }
  return router;
}
