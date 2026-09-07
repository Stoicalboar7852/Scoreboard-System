import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { loginInputSchema, type LoginInput } from '@scoreboard/shared';
import { ApiError, api } from '../../lib/api.js';
import { queryClient } from '../../lib/query.js';
import { liveSocket } from '../../lib/socket.js';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin/live';
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: { email: string } }>('/api/auth/login', { method: 'POST', body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      liveSocket().reconnect();
      void navigate(from, { replace: true });
    },
  });
  const error =
    login.error instanceof ApiError ? login.error.message : login.error ? 'Login failed' : null;
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6"
        noValidate
      >
        <h1 className="text-2xl font-bold text-court">Admin login</h1>
        <label className="block text-sm">
          <span className="text-text-muted">Email</span>
          <input
            type="email"
            autoComplete="username"
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2"
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <span className="text-xs text-danger">{form.formState.errors.email.message}</span>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <span className="text-xs text-danger">{form.formState.errors.password.message}</span>
          )}
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-court px-4 py-2 font-semibold text-bg disabled:opacity-60"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
