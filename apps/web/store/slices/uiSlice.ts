import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface UiState {
  toasts: Toast[];
  autoRefreshEnabled: boolean;
  lastError: string | null;
}

const initialState: UiState = {
  toasts: [],
  autoRefreshEnabled: false,
  lastError: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toastAdded: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
      },
      prepare(toast: { type: ToastType; message: string }) {
        return {
          payload: {
            id: crypto.randomUUID(),
            ...toast,
          },
        };
      },
    },
    toastDismissed(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    autoRefreshEnabledSet(state, action: PayloadAction<boolean>) {
      state.autoRefreshEnabled = action.payload;
    },
    lastErrorSet(state, action: PayloadAction<string | null>) {
      state.lastError = action.payload;
    },
  },
});

export const { toastAdded, toastDismissed, autoRefreshEnabledSet, lastErrorSet } = uiSlice.actions;
export default uiSlice.reducer;
