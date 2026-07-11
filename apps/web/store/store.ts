import { configureStore } from "@reduxjs/toolkit";
import uiReducer from "@/store/slices/uiSlice";
import orderFormReducer from "@/store/slices/orderFormSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      ui: uiReducer,
      orderForm: orderFormReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
