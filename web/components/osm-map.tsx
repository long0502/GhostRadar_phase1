'use client';

import dynamic from 'next/dynamic';

export const OSMMap = dynamic(
    () => import('./osm-map-client').then((mod) => mod.OSMMapClient),
    {
        ssr: false,
        loading: () => <div className="h-full w-full bg-black" />,
    }
);
