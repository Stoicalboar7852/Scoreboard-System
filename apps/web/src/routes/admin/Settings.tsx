import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  THEME_TOKENS,
  changePasswordInputSchema,
  settingsUpdateSchema,
  type SettingsUpdate,
  type ThemeTokenKey,
} from '@scoreboard/shared';
import { z } from 'zod';
import { useToast } from '../../components/Toaster.js';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  PageHeader,
  Select,
  Table,
  TextInput,
  errorMessage,
} from '../../components/ui/index.js';
import { adminApi } from '../../lib/adminApi.js';
import { queryClient } from '../../lib/query.js';

const ACCENT_KEYS: Array<{ key: ThemeTokenKey; label: string }> = [
  { key: 'court', label: 'Court name' },
  { key: 'team', label: 'Team names' },
  { key: 'score', label: 'Scores' },
  { key: 'phaseHalf1', label: 'Half 1' },
  { key: 'phaseHalfTime', label: 'Half time' },
  { key: 'phaseHalf2', label: 'Half 2' },
  { key: 'phaseBetweenGames', label: 'Between games' },
  { key: 'phaseWaiting', label: 'Waiting' },
  { key: 'phaseTimeout', label: 'Time out' },
  { key: 'phasePaused', label: 'Paused' },
];

const formSchema = settingsUpdateSchema.extend({
  controllerPin: z.string().max(12).optional(),
});
type FormValues = z.infer<typeof formSchema>;

function timezones(): string[] {
  try {
    return (
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
        'timeZone',
      ) ?? ['Australia/Sydney']
    );
  } catch {
    return ['Australia/Sydney'];
  }
}

export function Settings() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: adminApi.settings.get });
  const devices = useQuery({ queryKey: ['devices'], queryFn: adminApi.devices });
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { accentOverrides: {} },
  });
  useEffect(() => {
    if (settings.data) {
      form.reset({
        venueName: settings.data.venueName,
        timezone: settings.data.timezone,
        nextGameWindowMinutes: settings.data.nextGameWindowMinutes,
        defaultTimeoutSeconds: settings.data.defaultTimeoutSeconds,
        soundEnabled: settings.data.soundEnabled,
        accentOverrides: settings.data.accentOverrides,
        controllerPin: '',
      });
    }
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const { controllerPin, ...rest } = values;
      const body: SettingsUpdate = {
        ...rest,
        ...(controllerPin && controllerPin.length >= 4 ? { controllerPin } : {}),
      };
      return adminApi.settings.update(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['public', 'settings'] });
      toast('Settings saved', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const pwForm = useForm<z.infer<typeof changePasswordInputSchema>>({
    resolver: zodResolver(changePasswordInputSchema),
  });
  const changePassword = useMutation({
    mutationFn: adminApi.changePassword,
    onSuccess: () => {
      toast('Password changed', 'success');
      pwForm.reset();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const revoke = useMutation({
    mutationFn: adminApi.revokeDevice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const overrides = form.watch('accentOverrides') ?? {};
  const setOverride = (key: ThemeTokenKey, value: string | null) => {
    const next = { ...overrides };
    if (value) next[key] = value;
    else delete next[key];
    form.setValue('accentOverrides', next, { shouldDirty: true });
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Venue, controller PIN, display and account" />
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-6" noValidate>
        <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
          <Field label="Venue name" error={form.formState.errors.venueName?.message}>
            <TextInput {...form.register('venueName')} />
          </Field>
          <Field label="Timezone" error={form.formState.errors.timezone?.message}>
            <Select {...form.register('timezone')}>
              {timezones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Controller PIN"
            hint={
              settings.data?.hasControllerPin
                ? 'A PIN is set. Enter a new one to replace it.'
                : 'No PIN set: controllers cannot register.'
            }
            error={form.formState.errors.controllerPin?.message}
          >
            <TextInput
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="New PIN (4–12 digits)"
              {...form.register('controllerPin')}
            />
          </Field>
          <Field
            label="Next-game highlight window (minutes)"
            error={form.formState.errors.nextGameWindowMinutes?.message}
          >
            <TextInput
              type="number"
              min={1}
              {...form.register('nextGameWindowMinutes', { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Default time-out length (seconds)"
            error={form.formState.errors.defaultTimeoutSeconds?.message}
          >
            <TextInput
              type="number"
              min={1}
              {...form.register('defaultTimeoutSeconds', { valueAsNumber: true })}
            />
          </Field>
          <div className="pt-6">
            <Checkbox
              label="Sound the horn at the end of each phase on scoreboards"
              {...form.register('soundEnabled')}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 font-semibold text-team">Accent colours</h2>
          <p className="mb-3 text-xs text-text-muted">
            Leave a colour unset to use the default. Every colour must stay readable on the dark
            background.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACCENT_KEYS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={overrides[key] ?? THEME_TOKENS[key]}
                  onChange={(e) => setOverride(key, e.target.value.toUpperCase())}
                  aria-label={`${label} colour`}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-bg"
                />
                <span className="flex-1">{label}</span>
                {overrides[key] && (
                  <button
                    type="button"
                    className="text-xs text-text-muted underline"
                    onClick={() => setOverride(key, null)}
                  >
                    reset
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </form>

      <section className="mt-8 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold text-team">Change admin password</h2>
        <form
          onSubmit={pwForm.handleSubmit((v) => changePassword.mutate(v))}
          className="grid gap-3 sm:grid-cols-2"
          noValidate
        >
          <Field label="Current password" error={pwForm.formState.errors.currentPassword?.message}>
            <TextInput
              type="password"
              autoComplete="current-password"
              {...pwForm.register('currentPassword')}
            />
          </Field>
          <Field
            label="New password (8+ characters)"
            error={pwForm.formState.errors.newPassword?.message}
          >
            <TextInput
              type="password"
              autoComplete="new-password"
              {...pwForm.register('newPassword')}
            />
          </Field>
          <div>
            <Button type="submit" disabled={changePassword.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-team">Registered controller devices</h2>
        <Table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Court</th>
              <th>Last seen</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(devices.data ?? []).map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.courtName ?? '—'}</td>
                <td>{d.lastSeenAtMs ? new Date(d.lastSeenAtMs).toLocaleString() : 'never'}</td>
                <td>
                  {d.revokedAtMs ? (
                    <Badge tone="danger">revoked</Badge>
                  ) : (
                    <Badge tone="success">active</Badge>
                  )}
                </td>
                <td className="text-right">
                  {!d.revokedAtMs && (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(d.id)}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {devices.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="text-text-muted">
                  No devices registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
