'use client';

import dynamic from 'next/dynamic';

export const LocationPickerMap = dynamic(
  () => import('./location-picker-map').then((mod) => mod.LocationPickerMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full rounded-2xl bg-[#050b14]" />,
  }
);
