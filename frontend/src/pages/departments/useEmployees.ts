import { useCallback, useEffect, useState } from 'react';
import type { Employee } from '../../mocks/employees';

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/employees/');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Employee[];
      setEmployees(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addEmployee = useCallback(async (emp: Omit<Employee, 'id' | 'avatar'>): Promise<Employee> => {
    const res = await fetch('/api/employees/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const created = (await res.json()) as Employee;
    setEmployees(prev => [...prev, created]);
    return created;
  }, []);

  const updateEmployee = useCallback(async (id: string, emp: Partial<Omit<Employee, 'id' | 'avatar'>>): Promise<Employee> => {
    const res = await fetch(`/api/employees/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const updated = (await res.json()) as Employee;
    setEmployees(prev => prev.map(e => e.id === id ? updated : e));
    return updated;
  }, []);

  const deleteEmployee = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/employees/${id}/`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setEmployees(prev => prev.filter(e => e.id !== id));
  }, []);

  return { employees, loading, error, addEmployee, updateEmployee, deleteEmployee };
}
