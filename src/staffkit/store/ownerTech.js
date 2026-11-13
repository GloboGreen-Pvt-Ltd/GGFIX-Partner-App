import { useEffect, useState } from 'react';
import { getSession } from '../../auth/session';
import { cachedOwnerTech, getOwnerTech } from '../../api/ownerTechnician';

/** Owner as Technician: the owner's technician id + user id (replaces the Employee app's redux auth). */
export function useOwnerTechIds() {
  const [ids, setIds] = useState({ technicianId: cachedOwnerTech()?.technicianId || null, userId: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSession().catch(() => null);
      const ot = cachedOwnerTech() || await getOwnerTech().catch(() => null);
      if (alive) setIds({ technicianId: ot?.technicianId || null, userId: s?.user?.id || s?.userId || null });
    })();
    return () => { alive = false; };
  }, []);
  return ids;
}
