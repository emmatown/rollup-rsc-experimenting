"use client";
import { useState } from "react";

export function Counter() {
  const [counter, setCounter] = useState(0);
  return (
    <div>
      <button onClick={() => setCounter(counter + 1)}>+</button>
      <button onClick={() => setCounter(counter - 1)}>-</button>
      <div>{counter}</div>
    </div>
  );
}
