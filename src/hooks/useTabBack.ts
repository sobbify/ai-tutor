import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/** Back from a tab screen goes to the Home tab (tabs replace each other in history). */
export function useTabBack() {
  const navigate = useNavigate();
  return useCallback(() => void navigate('/', { replace: true, viewTransition: true }), [navigate]);
}
