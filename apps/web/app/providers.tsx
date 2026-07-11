"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/store/store";
import { ToastHost } from "@/components/ToastHost";

export function Providers({ children }: { children: React.ReactNode }) {
  const [store] = useState<AppStore>(() => makeStore());

  return (
    <Provider store={store}>
      {children}
      <ToastHost />
    </Provider>
  );
}
