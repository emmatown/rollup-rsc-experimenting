"use client";
import { useTransition } from "react";
import { useRouter, useUrl } from "../router";

export function RouterDemo() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const url = useUrl();
  return (
    <div>
      <p>url from a client component: {url}</p>
      <button
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      >
        Refresh
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          const formData = new FormData(event.currentTarget);
          let url = new URL(formData.get("url") as string).toString();
          startTransition(() => {
            router.navigate(url);
          });
        }}
      >
        <label>
          New url
          <input name="url" defaultValue={url} />
        </label>
        <button disabled={isPending} type="submit">
          Navigate
        </button>
      </form>
    </div>
  );
}
