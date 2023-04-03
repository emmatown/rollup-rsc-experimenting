import { Suspense } from "react";
import { Counter } from "./counter";
import { RouterDemo } from "./router-demo";
import { OnlyOnOther } from "./client-only-on-other";

async function SomethingAsync() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <div>this was async</div>;
}

export function Root(props: { url: string }) {
  return (
    <html>
      <head>
        <title>something</title>
      </head>
      <body>
        it works
        {new URL(props.url).pathname === "/other" && <OnlyOnOther />}
        <p>url: {props.url}</p>
        <p>a random number: {Math.random()}</p>
        <Counter />
        <RouterDemo />
        <Suspense fallback="loading">
          <SomethingAsync />
        </Suspense>
      </body>
    </html>
  );
}
