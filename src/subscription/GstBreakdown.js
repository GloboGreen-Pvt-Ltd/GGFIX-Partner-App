// GST calculator rows for a server `gst` object (contract §2 / §6). Display
// only: every amount comes from the server — nothing here computes tax.
import React from 'react';
import { Text, View } from 'react-native';
import { formatPaise } from './format';
import { C, KV } from './ui';

/** 9 → "9%", 9.5 → "9.5%", "18.00" → "18%". */
export const pct = (v) => `${Number((Number(v) || 0).toFixed(2))}%`;

/** True when the server sent a usable breakdown. */
export const hasGst = (gst) => !!gst && typeof gst === 'object' && gst.totalPaise != null;

/** IGST when the server says inter-state, or put the whole tax in IGST. */
export const isIgst = (gst) => !!gst?.interState || (Number(gst?.igstPaise) > 0 && !Number(gst?.cgstPaise));

/** "Tax Invoice" / "Receipt" from documentType (or gst.documentType). */
export const documentLabel = (type) => (String(type || '').toUpperCase() === 'TAX_INVOICE' ? 'Tax Invoice' : 'Receipt');

/** One-line footer caption: "Incl. GST ₹183.05 (CGST 9% + SGST 9%)" or "Prices include all charges". */
export function gstCaption(gst) {
  if (!hasGst(gst)) return null;
  if (!gst.applicable) return 'Prices include all charges';
  const split = isIgst(gst) ? `IGST ${pct(gst.igstPercent)}` : `CGST ${pct(gst.cgstPercent)} + SGST ${pct(gst.sgstPercent)}`;
  return `Incl. GST ${formatPaise(gst.taxPaise)} (${split})`;
}

/**
 * Plan Price → Discount → Taxable Amount → CGST + SGST (or IGST) → Total.
 * Not applicable: Plan Price → Discount → Total + "Prices include all charges".
 * Renders nothing without a server breakdown — callers keep their old rows.
 */
export default function GstBreakdown({ gst, totalLabel = 'Total Payable', discountLabel = 'Discount', showPlaceOfSupply = true }) {
  if (!hasGst(gst)) return null;
  const discount = Number(gst.discountPaise) || 0;
  const discountValue = discount > 0 ? `− ${formatPaise(discount)}` : formatPaise(0);
  const igst = isIgst(gst);
  return (
    <View>
      <KV label="Plan Price" value={formatPaise(gst.grossPaise)} />
      <KV label={discountLabel} value={discountValue} tone={discount > 0 ? C.green : undefined} />
      {gst.applicable ? (
        <>
          <KV label="Taxable Amount" value={formatPaise(gst.taxablePaise)} />
          {igst ? (
            <KV label={`IGST ${pct(gst.igstPercent)}`} value={formatPaise(gst.igstPaise)} />
          ) : (
            <>
              <KV label={`CGST ${pct(gst.cgstPercent)}`} value={formatPaise(gst.cgstPaise)} />
              <KV label={`SGST ${pct(gst.sgstPercent)}`} value={formatPaise(gst.sgstPaise)} />
            </>
          )}
        </>
      ) : null}
      <KV label={totalLabel} value={formatPaise(gst.totalPaise)} strong last />
      <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
        {gst.applicable
          ? `GST ${pct(gst.ratePercent)} ${gst.inclusive === false ? 'added to' : 'included in'} the price.${showPlaceOfSupply && gst.placeOfSupply ? ` Place of supply: ${gst.placeOfSupply}.` : ''}`
          : 'Prices include all charges.'}
      </Text>
    </View>
  );
}
