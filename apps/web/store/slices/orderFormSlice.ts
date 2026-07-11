import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface OrderFormItem {
  sku: string;
  qty: string;
  unitPrice: string;
}

interface OrderFormState {
  customerId: string;
  deliveryAddress: string;
  branchId: string;
  items: OrderFormItem[];
  validationErrors: string[];
}

function emptyItem(): OrderFormItem {
  return { sku: "", qty: "1", unitPrice: "" };
}

const initialState: OrderFormState = {
  customerId: "",
  deliveryAddress: "",
  branchId: "",
  items: [emptyItem()],
  validationErrors: [],
};

const orderFormSlice = createSlice({
  name: "orderForm",
  initialState,
  reducers: {
    customerIdSet(state, action: PayloadAction<string>) {
      state.customerId = action.payload;
    },
    deliveryAddressSet(state, action: PayloadAction<string>) {
      state.deliveryAddress = action.payload;
    },
    branchIdSet(state, action: PayloadAction<string>) {
      state.branchId = action.payload;
    },
    itemAdded(state) {
      state.items.push(emptyItem());
    },
    itemRemoved(state, action: PayloadAction<number>) {
      if (state.items.length > 1) {
        state.items = state.items.filter((_, i) => i !== action.payload);
      }
    },
    itemUpdated(state, action: PayloadAction<{ index: number; field: keyof OrderFormItem; value: string }>) {
      const { index, field, value } = action.payload;
      const row = state.items[index];
      if (row) row[field] = value;
    },
    validationErrorsSet(state, action: PayloadAction<string[]>) {
      state.validationErrors = action.payload;
    },
    orderFormReset() {
      return initialState;
    },
  },
});

export const {
  customerIdSet,
  deliveryAddressSet,
  branchIdSet,
  itemAdded,
  itemRemoved,
  itemUpdated,
  validationErrorsSet,
  orderFormReset,
} = orderFormSlice.actions;
export default orderFormSlice.reducer;
