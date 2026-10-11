import React from 'react';
import { ArrowLeft, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';

const AuthShell = ({ eyebrow, title, subtitle, alternateAction, children }) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f0e9] fade-in">
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between border border-[#d7d0c5] bg-[#fbfaf6] px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center bg-[#e8e1d6] text-[#7d4436]">
              <Brain className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-slate-900">AI资讯平台</span>
              <span className="block text-sm text-slate-500">账号入口与用户体系</span>
            </span>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center border border-[#cfc7bc] bg-white px-4 py-2 text-sm font-medium text-[#615b53] transition hover:border-[#7d4436] hover:text-[#7d4436]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回首页
          </Link>
        </div>

        <div className="grid flex-1 gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative overflow-hidden border border-[#d2c9bb] bg-[#e9e2d7] px-6 py-7 text-[#292621] sm:px-8 lg:px-10 lg:py-10">
            <div className="relative flex h-full flex-col justify-between gap-12">
              <div className="space-y-5">
                <div className="inline-flex items-center border border-[#c5b8a8] bg-[#f6f2eb] px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-[#7d4436]">
                  {eyebrow}
                </div>
                <h1 className="max-w-xl text-4xl font-semibold leading-[1.02] text-[#292621] sm:text-5xl lg:text-6xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="max-w-lg text-sm leading-7 text-[#655e56] sm:text-base">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 border border-[#cfc5b7] bg-[#f4efe7] p-5">
                <div className="border border-[#d8d0c4] bg-white/60 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#7d4436]">入口</div>
                  <div className="mt-2 text-lg font-semibold">邮箱登录 / 注册</div>
                </div>
                <div className="border border-[#d8d0c4] bg-white/60 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#7d4436]">说明</div>
                  <div className="mt-2 text-sm text-[#655e56]">填写账号信息后即可继续。</div>
                </div>
              </div>
            </div>
          </section>

          <section className="border border-[#d7d0c5] bg-[#fbfaf6] p-6 sm:p-8 lg:p-10">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900">账号入口</div>
                <p className="text-sm text-slate-500">完成后自动进入站内账户页</p>
              </div>
              {alternateAction}
            </div>
            {children}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AuthShell;
