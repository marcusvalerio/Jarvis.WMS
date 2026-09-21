"use client";

import { useEffect, useRef, useState } from "react";

type Detector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

declare global {
  interface Window {
    BarcodeDetector?: DetectorCtor;
  }
}

export function CameraScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [status, setStatus] = useState("Iniciando camera…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador nao disponibiliza acesso a camera.");
        return;
      }

      if (!window.BarcodeDetector) {
        setError("Este navegador nao oferece leitura de codigo de barras pela camera. Use a coletora ou o campo manual.");
        return;
      }

      try {
        const detector = new window.BarcodeDetector({
          formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "itf"],
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        setStatus("Aponte a camera para o codigo de barras.");

        const scan = async () => {
          if (cancelled) return;
          const current = videoRef.current;

          if (current && current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !busyRef.current) {
            busyRef.current = true;
            try {
              const codes = await detector.detect(current);
              const value = codes.find((code) => code.rawValue)?.rawValue?.trim();
              if (value) {
                onDetected(value);
                return;
              }
            } catch {
              // A leitura pode falhar em um frame; o proximo frame tenta novamente.
            } finally {
              busyRef.current = false;
            }
          }

          frameRef.current = window.requestAnimationFrame(scan);
        };

        frameRef.current = window.requestAnimationFrame(scan);
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Permissao da camera negada. Libere a camera no navegador para usar esta opcao."
          : "Nao foi possivel acessar a camera deste dispositivo.";
        setError(message);
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#101313] p-4 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/55">Leitura por camera</p>
            <h2 className="text-[18px] font-semibold mt-1">Ler codigo de barras</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-3 rounded-lg border border-white/15 text-[13px] text-white/80"
          >
            Fechar
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-black aspect-[4/3]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-20 border-2 border-[#b8ff3d] rounded-lg" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-px bg-[#b8ff3d]/70" />
        </div>

        <p className="text-[13px] text-white/70 mt-3 leading-snug">
          {error ?? status}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 mt-4 rounded-xl bg-white/10 border border-white/15 text-[14px] font-medium"
        >
          Cancelar leitura
        </button>
      </div>
    </div>
  );
}
