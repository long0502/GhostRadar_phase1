'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { expandEvent } from '@/lib/api';
import type { EventDetail } from '@/lib/types';

function dossierText(detail: EventDetail | null): string {
  if (!detail) {
    return '';
  }

  return detail.story_text ?? detail.detail?.story_text ?? 'No dossier text available.';
}

export default function DossierPage() {
  const params = useParams<{ event_id: string }>();
  const eventId = params.event_id;
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setStatus('loading');
        const data = await expandEvent(eventId);
        if (!isMounted) {
          return;
        }
        setDetail(data);
        setStatus('ready');
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load dossier.');
        setStatus('error');
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  return (
    <main className="min-h-screen bg-grid bg-[size:22px_22px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[32px] border border-sky-500/20 bg-panel/90 p-6 shadow-radar backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/70">GhostRadar PRO</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Level 1 dossier</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-dashed border-white/15 bg-slate-950/50 p-5">
            <div className="flex h-[360px] items-center justify-center rounded-[22px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-center text-sm text-slate-500">
              Image placeholder
            </div>
          </div>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
            {status === 'loading' ? (
              <p className="text-sm text-slate-400">Expanding dossier...</p>
            ) : status === 'error' ? (
              <p className="text-sm text-rose-300">{errorMessage}</p>
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-white">{detail?.id ?? eventId}</h2>
                <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                  {dossierText(detail)}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
