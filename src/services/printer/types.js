/** Which physical link the label gets sent over. */
export const PRINTER_TRANSPORT = {
  BLUETOOTH: 'bluetooth',
  NETWORK: 'network',
  USB: 'usb',
};

/**
 * Printer connection/print lifecycle states shown to the shop — one state
 * per distinct message/screen the sheet can be in, not an exhaustive
 * protocol FSM. Shared across all three transports — a given state's exact
 * meaning ("checking...", "found...") is transport-aware only in its label
 * text (see PrinterConnectSheet.js's STATUS_TEXT), not in a separate state
 * per transport.
 */
export const PRINTER_STATE = {
  IDLE: 'IDLE',
  CHECKING_BLUETOOTH: 'CHECKING_BLUETOOTH',
  BLUETOOTH_DISABLED: 'BLUETOOTH_DISABLED',
  REQUESTING_PERMISSION: 'REQUESTING_PERMISSION',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PRINTER_FOUND: 'PRINTER_FOUND',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  GENERATING_LABEL: 'GENERATING_LABEL',
  PRINTING: 'PRINTING',
  PRINT_SUCCESS: 'PRINT_SUCCESS',
  PRINT_ERROR: 'PRINT_ERROR',
  DISCONNECTED: 'DISCONNECTED',
};
