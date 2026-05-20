import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: 'white',
          borderRadius: 112,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: 380,
            fontWeight: 900,
            letterSpacing: -14,
            fontFamily: 'sans-serif',
            lineHeight: 1,
            display: 'flex',
          }}
        >
          <span style={{ color: '#1A1A1A' }}>f</span>
          <span style={{ color: '#2D6A4F' }}>t</span>
        </span>
      </div>
    ),
    { width: 512, height: 512 }
  )
}
