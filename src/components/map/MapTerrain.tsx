import { useId } from 'react';

export function MapTerrain() {
  const prefix = useId();

  return (
    <>
      <defs>
        <pattern
          id={`${prefix}-rows`}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(12)"
        >
          <path
            d="M0 0V7"
            stroke="#303d19"
            strokeWidth="2"
            opacity=".19"
          />
        </pattern>
        <pattern
          id={`${prefix}-fineRows`}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(102)"
        >
          <path
            d="M0 0V4"
            stroke="#e5d9a3"
            strokeWidth="1"
            opacity=".18"
          />
        </pattern>
        <filter id={`${prefix}-terrain`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".52"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".24" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <g filter={`url(#${prefix}-terrain)`}>
        <rect
          x="-500"
          y="-500"
          width="1900"
          height="1500"
          fill="#929467"
        />
        {Array.from({ length: 70 }, (_, i) => {
          const x = (i % 10) * 119 - 160;
          const y = Math.floor(i / 10) * 104 - 105;
          return (
            <g key={i} transform={`rotate(9 ${x} ${y})`}>
              <rect
                x={x}
                y={y}
                width={113}
                height={98}
                fill={['#828851', '#a6a071', '#6e7f49', '#9b9664', '#ad9f74', '#6f7848', '#8c945d'][i % 7]}
                stroke="#626c42"
                strokeWidth="3"
              />
              <rect
                x={x}
                y={y}
                width={113}
                height={98}
                fill={i % 3 ? `url(#${prefix}-rows)` : `url(#${prefix}-fineRows)`}
              />
            </g>
          );
        })}
        <path
          d="M-30 405C50 370 65 290 103 220S155 128 170 48 218 -20 250 -80"
          fill="none"
          stroke="#3e5336"
          strokeWidth="51"
        />
        <path
          d="M-30 405C50 370 65 290 103 220S155 128 170 48 218 -20 250 -80"
          fill="none"
          stroke="#71857b"
          strokeWidth="14"
        />
        {Array.from({ length: 85 }, (_, i) => (
          <circle
            key={i}
            cx={98 + Math.sin(i * 2.3) * 30 + i * .85}
            cy={400 - i * 5.5}
            r={5 + i % 7}
            fill={['#364c2d', '#4c5e34', '#56683d'][i % 3]}
          />
        ))}
        <path
          d="M-100 177L950 340M462 -100L352 650"
          stroke="#535d37"
          strokeWidth="15"
        />
        <path
          d="M-100 177L950 340M462 -100L352 650"
          stroke="#b9b49b"
          strokeWidth="7"
        />
        <path
          d="M-100 177L950 340"
          stroke="#ddd4b7"
          strokeWidth="2"
        />
        <path
          d="M182 55L785 142 715 475 144 369Z"
          fill="none"
          stroke="#bdb38f"
          strokeWidth="5"
        />
      </g>
    </>
  );
}
