'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { expandEvent } from '@/lib/api';
import type { EventDetail } from '@/lib/types';
import { useLanguage } from '@/i18n/LanguageContext';

function dossierText(detail: EventDetail | null): string {
  if (!detail) {
    return '';
  }

  return detail.story_text ?? (detail.detail as Record<string, unknown>)?.story_text as string ?? 'No dossier text available.';
}

export default function DossierPage() {
  const { language } = useLanguage();
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
        const data = await expandEvent(eventId, language);
        if (!isMounted) {
          return;
        }
        setDetail(data);
        setStatus('ready');
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Không thể mở hồ sơ. Tín hiệu vừa tan vào tầng nhiễu.');
        setStatus('error');
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [eventId, language]);

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

        <div className="mt-6">
          <section className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
            {status === 'loading' ? (
              <p className="text-sm text-slate-400">Đang khai mở hồ sơ từ tầng sương dữ liệu...</p>
            ) : status === 'error' ? (
              <p className="text-sm text-rose-300">{errorMessage}</p>
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-white text-center border-b border-white/10 pb-4 mb-4">
                  DOSSIER #{detail?.id?.substring(0, 8) ?? eventId.substring(0, 8)}
                </h2>
                
                <div className="space-y-6">
                  {detail?.detail && typeof detail.detail === 'object' ? (
                    <>
                      <div>
                        <h3 className="text-[11px] font-bold tracking-[0.2em] text-sky-400 mb-2">LEGEND OVERVIEW</h3>
                        <p className="text-sm leading-7 text-slate-300">{(detail.detail as any).legend_overview || 'No overview available.'}</p>
                      </div>

                      <div>
                        <h3 className="text-[11px] font-bold tracking-[0.2em] text-rose-400 mb-2">CHRONOLOGICAL HISTORY</h3>
                        <p className="text-sm leading-7 text-slate-300">{(detail.detail as any).chronological_history || 'No history available.'}</p>
                      </div>

                      {Array.isArray((detail.detail as any).witnesses) && ((detail.detail as any).witnesses.length > 0) && (
                        <div>
                          <h3 className="text-[11px] font-bold tracking-[0.2em] text-amber-400 mb-2">WITNESS TESTIMONIES</h3>
                          <div className="space-y-3">
                            {(detail.detail as any).witnesses.map((w: any, i: number) => (
                              <div key={i} className="bg-slate-900/50 p-4 rounded-[16px] border border-white/5">
                                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">{w.name} • {w.date}</p>
                                <p className="text-sm italic text-slate-300">&quot;{w.testimony}&quot;</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <h3 className="text-[11px] font-bold tracking-[0.2em] text-emerald-400 mb-2">SPECTRAL ANALYSIS</h3>
                        <p className="text-sm leading-7 text-slate-300">{(detail.detail as any).spectral_analysis || 'No spectral data.'}</p>
                      </div>

                      <div className="bg-red-950/20 p-4 rounded-[16px] border border-red-500/20">
                        <h3 className="text-[11px] font-bold tracking-[0.2em] text-orange-400 mb-2">RISK ASSESSMENT</h3>
                        <p className="text-sm leading-7 text-red-200 font-medium">{(detail.detail as any).risk_assessment || 'Unknown risk.'}</p>
                      </div>

                      <div className="pt-2">
                        <h3 className="text-[11px] font-bold tracking-[0.2em] text-sky-400 mb-3">VISUAL RECORD</h3>
                        <div className="rounded-[28px] border border-dashed border-white/15 bg-slate-950/50 p-5">
                          <div className="flex h-[360px] items-center justify-center rounded-[22px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-center text-sm text-slate-500">
                            Phục dựng thị giác sẽ xuất hiện khi dấu vết đủ rõ ở cuối hồ sơ.
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                      {dossierText(detail)}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
