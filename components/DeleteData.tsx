"use client";

import { useState } from "react";
import { clearAllData } from "@/lib/store";

export function DeleteData() {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-small"
      style={{ padding: 0 }}
      onClick={() => {
        clearAllData();
        setDone(true);
      }}
    >
      {done ? "✓ All your data on this device was deleted" : "Delete my data from this device"}
    </button>
  );
}
