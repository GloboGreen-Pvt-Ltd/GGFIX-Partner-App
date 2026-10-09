import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
  // Dev-only safety-net middleware (stripped entirely from production
  // builds) deep-scans every dispatched action against a default 32ms
  // threshold. `setSession`'s payload is the full merged session object
  // (shops[], activeShop, KYC/address fields, etc.) — genuinely
  // serializable, just larger than the default threshold expects, so this
  // raises the threshold rather than silencing a real correctness signal.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { warnAfter: 128 },
      immutableCheck: { warnAfter: 128 },
    }),
});
