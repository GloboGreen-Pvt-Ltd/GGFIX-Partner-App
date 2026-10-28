// Optional checklist templates for Staff Tasks. The owner picks one, then
// edits / removes / adds steps; nothing is forced to be ticked off.
export const CHECKLIST_TEMPLATES = [
  {
    key: 'CUSTOMER_DELIVERY',
    name: 'Customer Delivery',
    items: ['Call customer before leaving', 'Pack items safely', 'Carry invoice / bill', 'Hand over and collect payment', 'Confirm delivery with customer'],
  },
  {
    key: 'PARCEL_HANDOVER',
    name: 'Parcel Handover',
    items: ['Check parcel and label', 'Hand over at courier / bus counter', 'Collect receipt / tracking number', 'Share tracking details with customer'],
  },
  {
    key: 'SUPPLIER_PURCHASE',
    name: 'Supplier Purchase',
    items: ['Confirm part list and prices', 'Check parts before paying', 'Collect bill', 'Update stock on return'],
  },
  {
    key: 'BANK_WORK',
    name: 'Bank Work',
    items: ['Carry cash / cheque and slip', 'Count cash before deposit', 'Collect counterfoil / receipt', 'Hand receipt to owner'],
  },
  {
    key: 'SHOP_CLEANING',
    name: 'Shop Cleaning',
    items: ['Clean counter and display', 'Clean workbench and tools', 'Sweep and mop floor', 'Empty dustbins'],
  },
  {
    key: 'SERVICE_VISIT',
    name: 'Service Visit',
    items: ['Call customer and confirm address', 'Carry tools and spare parts', 'Note issue and work done', 'Get customer signature / OTP', 'Collect payment'],
  },
];
