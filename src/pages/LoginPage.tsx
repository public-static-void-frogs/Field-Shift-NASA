import { Button, Form, Input } from 'antd';
import { ArrowRight } from 'lucide-react';
import type { Navigate } from '../types/navigation';
import '../styles/login.css';

// A static, filter-free illustration: crop rows are shared SVG patterns.
function FarmlandBackdrop() {
  return <div className="login-landscape" aria-hidden="true">
    <svg className="login-farmland" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <pattern id="login-crop-rows" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <path d="M0 0V16" stroke="#344f2c" strokeWidth="3" opacity=".16" />
        </pattern>
        <pattern id="login-harvest-rows" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(34)">
          <path d="M0 0V12" stroke="#fff9dc" strokeWidth="2" opacity=".32" />
        </pattern>
        <pattern id="login-orchard" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(-16)">
          <circle cx="16" cy="16" r="5" fill="#42653b" opacity=".22" />
        </pattern>
      </defs>
      <rect width="1600" height="1000" fill="#e9eddd" />
      <g stroke="#f4f5e9" strokeWidth="9" strokeLinejoin="round">
        <path d="M-90-20H454L382 218 40 330-90 234Z" fill="#c9d5ad" />
        <path d="M-90-20H454L382 218 40 330-90 234Z" fill="url(#login-crop-rows)" />
        <path d="M454-20H754L652 175 382 218Z" fill="#d9cca2" />
        <path d="M454-20H754L652 175 382 218Z" fill="url(#login-harvest-rows)" />
        <path d="M754-20H1110L1234 186 933 224 652 175Z" fill="#c1cda6" />
        <path d="M754-20H1110L1234 186 933 224 652 175Z" fill="url(#login-crop-rows)" />
        <path d="M1110-20H1650V235L1400 332 1234 186Z" fill="#a9bf94" />
        <path d="M1110-20H1650V235L1400 332 1234 186Z" fill="url(#login-orchard)" />
        <path d="M-90 234 40 330 382 218 338 500 30 614-90 530Z" fill="#9eb68b" />
        <path d="M-90 234 40 330 382 218 338 500 30 614-90 530Z" fill="url(#login-orchard)" />
        <path d="M-90 530 30 614 338 500 435 772 250 895-90 816Z" fill="#d4c597" />
        <path d="M-90 530 30 614 338 500 435 772 250 895-90 816Z" fill="url(#login-harvest-rows)" />
        <path d="M-90 816 250 895 435 772 685 1040H-90Z" fill="#b2c19a" />
        <path d="M-90 816 250 895 435 772 685 1040H-90Z" fill="url(#login-crop-rows)" />
        <path d="M435 772 772 813 955 1040H685Z" fill="#d6dcb9" />
        <path d="M435 772 772 813 955 1040H685Z" fill="url(#login-orchard)" />
        <path d="M772 813 1114 741 1350 1020 955 1040Z" fill="#b0c099" />
        <path d="M772 813 1114 741 1350 1020 955 1040Z" fill="url(#login-crop-rows)" />
        <path d="M1114 741 1428 665 1650 847V1040H1350Z" fill="#c6b47e" />
        <path d="M1114 741 1428 665 1650 847V1040H1350Z" fill="url(#login-harvest-rows)" />
        <path d="M1400 332 1650 235V847L1428 665 1252 547Z" fill="#bdcda7" />
        <path d="M1400 332 1650 235V847L1428 665 1252 547Z" fill="url(#login-crop-rows)" />
      </g>
      <path d="M387-30C350 140 290 280 322 455S506 692 434 823 350 940 380 1030" fill="none" stroke="#eef2e5" strokeWidth="34" />
      <path d="M387-30C350 140 290 280 322 455S506 692 434 823 350 940 380 1030" fill="none" stroke="#9aac82" strokeWidth="2" opacity=".45" />
      <path d="M1275-30C1160 150 1308 240 1260 410S1165 658 1290 791 1460 907 1440 1030" fill="none" stroke="#d2dfd5" strokeWidth="22" />
      <path d="M1275-30C1160 150 1308 240 1260 410S1165 658 1290 791 1460 907 1440 1030" fill="none" stroke="#93ad9e" strokeWidth="2" opacity=".5" />
      <g fill="none" stroke="#aab993" strokeWidth="1" opacity=".24">
        <ellipse cx="800" cy="485" rx="291" ry="344" />
        <ellipse cx="800" cy="485" rx="315" ry="369" />
        <ellipse cx="800" cy="485" rx="339" ry="394" />
      </g>
    </svg>
    <div className="login-cloud-shadow login-cloud-one" />
    <div className="login-cloud-shadow login-cloud-two" />
  </div>;
}

export function LoginPage({ navigate }: { navigate: Navigate }) {
  return <main className="login-page">
    <FarmlandBackdrop />
    <div className="login-corner-brand" aria-hidden="true">
      <img src="/frog-farmer.png" width={32} height={32} alt="" />
      <span>FrogFarmers</span>
    </div>
    <section className="login-clearing" aria-labelledby="login-heading">
      <div className="login-brand">
        <img src="/frog-farmer.png" width={64} height={64} alt="" />
        <span>FrogFarmers</span>
      </div>
      <h1 id="login-heading">Log in</h1>
      <Form
        name="login"
        layout="vertical"
        requiredMark={false}
        // Frontend demo only: connect authentication here when a service is available.
        onFinish={() => navigate('/')}
      >
        <Form.Item label="Login" name="login" rules={[{ required: true, whitespace: true, message: 'Enter your login.' }]}>
          <Input autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Your login" />
        </Form.Item>
        <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Enter your password.' }]}>
          <Input.Password autoComplete="current-password" placeholder="Your password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block icon={<ArrowRight size={18} />} iconPlacement="end">Log in</Button>
      </Form>
    </section>
  </main>;
}
