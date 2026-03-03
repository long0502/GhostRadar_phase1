'use client';

import dynamic from 'next/dynamic';

export const LeafletMap = dynamic(() => import('./leaflet-map').then((mod) => mod.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#050b14]" />,
});
