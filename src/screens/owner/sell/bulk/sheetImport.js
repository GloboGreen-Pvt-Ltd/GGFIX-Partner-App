import { LISTING, newRow } from './bulkDraft';
import { loadModelOptions, loadModels } from './catalog';
import { matchKey, parseGb } from './csv';

// Parsed sheet rows → bulk draft rows. Model names are matched against the
// template brand's catalogue, RAM / storage / colour against the master
// lists, so matched rows carry real ids. Anything unmatched keeps its typed
// name and a note telling the shop to pick it from the catalogue.

const gbOf = (opt) => (opt?.valueGb != null ? Number(opt.valueGb) : parseGb(opt?.label || opt?.name));

export async function rowsFromSheet(parsedRows, draft) {
  const t = draft.template;
  const wantsModels = !!t.brandId && parsedRows.some((r) => r.model);
  const [models, opts] = await Promise.all([
    wantsModels ? loadModels({ categoryId: t.categoryId, brandId: t.brandId }).catch(() => []) : Promise.resolve([]),
    loadModelOptions(null).catch(() => ({ allColors: [], allRams: [], allStorages: [] })),
  ]);
  const byName = new Map();
  (models || []).forEach((m) => {
    byName.set(matchKey(m.name), m);
    if (t.brandName) byName.set(matchKey(`${t.brandName} ${m.name}`), m);
  });
  const findModel = (name) => (name ? byName.get(matchKey(name)) || null : null);
  const ramFor = (label) => (label ? (opts.allRams || []).find((o) => gbOf(o) === parseGb(label)) || null : null);
  const storageFor = (label) => (label ? (opts.allStorages || []).find((o) => gbOf(o) === parseGb(label)) || null : null);
  const colorFor = (name) => {
    if (!name) return null;
    const hit = (opts.allColors || []).find((c) => matchKey(c.name) === matchKey(name));
    return hit ? hit.name : name;
  };

  return parsedRows.map((r) => {
    const notes = [...r.errors, ...r.warnings].map((m) => `Sheet line ${r.line}: ${m}`);
    const usesModel = r.listingType !== LISTING.ACCESSORY;
    const model = usesModel ? findModel(r.model) : null;
    if (r.listingType === LISTING.DEVICE && r.model && !model) {
      notes.push(`Sheet line ${r.line}: "${r.model}" was not found${t.brandName ? ` under ${t.brandName}` : ''} — edit to pick it from the catalogue`);
    }
    const ram = r.listingType === LISTING.DEVICE ? ramFor(r.ramLabel) : null;
    const storage = r.listingType === LISTING.DEVICE ? storageFor(r.storageLabel) : null;
    return newRow(draft, {
      listingType: r.listingType,
      title: r.title || '',
      brandId: model ? t.brandId : (r.listingType === LISTING.DEVICE ? null : t.brandId),
      brandName: model ? t.brandName : (r.listingType === LISTING.DEVICE ? null : t.brandName),
      seriesId: model?.seriesId || null,
      seriesName: model && model.seriesId && model.seriesId === t.seriesId ? t.seriesName : null,
      modelId: model?.id || null,
      modelName: model?.name || (usesModel ? r.model || null : null),
      modelImageUrl: model?.imageUrl || null,
      color: colorFor(r.color),
      ramOptionId: ram?.id || null,
      ramLabel: ram?.label || r.ramLabel || null,
      storageOptionId: storage?.id || null,
      storageLabel: storage?.label || r.storageLabel || null,
      itemCondition: r.itemCondition || t.itemCondition || 'USED',
      conditionGrade: r.itemCondition ? r.conditionGrade : t.conditionGrade,
      quantity: r.quantity || 1,
      price: r.price || '',
      imei: r.listingType === LISTING.DEVICE ? r.imei || '' : '',
      source: 'CSV',
      csvLine: r.line,
      notes,
    });
  });
}
