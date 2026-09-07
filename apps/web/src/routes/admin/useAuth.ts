import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/adminApi.js';

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: adminApi.me,
    staleTime: 60_000,
    retry: false,
  });
}
