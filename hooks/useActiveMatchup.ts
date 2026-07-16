import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { ActiveMatchup } from '@/types/database';

export function useActiveMatchup() {
  const [matchup, setMatchup] = useState<ActiveMatchup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('get_active_matchup');

    if (rpcError) {
      setError(rpcError.message);
      setMatchup(null);
    } else {
      setError(null);
      const row = Array.isArray(data) ? data[0] : data;
      setMatchup(row ?? null);
    }

    setLoading(false);
  }, []);

  return { matchup, loading, error, refresh };
}
