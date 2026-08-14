import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  accessToken: null,
  userId: null,
  shopId: null,
  shopSlug: null,
  roles: [],
  email: null,
  fullName: null,
  mobile: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(state, action) {
      const s = action.payload || {};
      state.accessToken = s.accessToken ?? null;
      state.userId = s.userId ?? null;
      state.shopId = s.shopId ?? null;
      state.shopSlug = s.shopSlug ?? null;
      state.roles = Array.isArray(s.roles) ? s.roles : [];
      state.email = s.email ?? null;
      state.fullName = s.fullName ?? null;
      state.mobile = s.mobile ?? null;
    },
    // Patch only the active-shop pointer, leaving token/roles/profile intact.
    // Dispatched whenever the persisted session's active shop changes (shop
    // switch, /auth/me refresh) so `selectShopId` consumers never drift from
    // the AsyncStorage session. Undefined keys are ignored so a partial payload
    // can't clobber the current values.
    setActiveShop(state, action) {
      const p = action.payload || {};
      if (p.shopId !== undefined) state.shopId = p.shopId ?? null;
      if (p.shopSlug !== undefined) state.shopSlug = p.shopSlug ?? null;
    },
    clearSession() {
      return initialState;
    },
  },
});

export const { setSession, setActiveShop, clearSession } = authSlice.actions;

export const selectSession = (state) => state.auth;
export const selectShopId = (state) => state.auth.shopId;
export const selectUserId = (state) => state.auth.userId;
export const selectRoles = (state) => state.auth.roles;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectIsLoggedIn = (state) => !!state.auth.accessToken;

export default authSlice.reducer;
