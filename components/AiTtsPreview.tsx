
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Play, Square, Loader2, Volume2, AlertCircle, ChevronDown, Key } from 'lucide-react';
import { Voice } from '../types';
import AudioVisualizer from './AudioVisualizer';

interface AiTtsPreviewProps {
  text: string;
  voices: Voice[];
}

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const AiTtsPreview: React.FC<AiTtsPreviewProps> = ({ text, voices }) => {
  const [selectedVoiceName, setSelectedVoiceName] = useState(voices[0]?.name || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isMountedRef = useRef(true);

  const MAX_WORDS = 20000;
  const wordCount = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);

  useEffect(() => {
    isMountedRef.current = true;
    
    const checkKey = async () => {
      if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
        const hasSelected = await (window as any).aistudio.hasSelectedApiKey();
        if (isMountedRef.current) setHasApiKey(hasSelected);
      } else if (process.env.API_KEY) {
        if (isMountedRef.current) setHasApiKey(true);
      }
    };
    checkKey();

    return () => {
      isMountedRef.current = false;
      stopAudio();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (isMountedRef.current) {
      setIsPlaying(false);
    }
  };

  const handleOpenKeyPicker = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof (window as any).aistudio?.openSelectKey === 'function') {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
      setError(null);
    }
  };

  const handlePlay = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (isLoading) return;
    if (isPlaying) { stopAudio(); return; }

    if (wordCount > MAX_WORDS) {
      setError("max limit is 20k words");
      return;
    }

    if (!process.env.API_KEY && !hasApiKey) {
      setError("Authentication required for AI Preview.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: text }] },
        config: {
          responseModalalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoiceName } },
          },
        },
      });
      
      if (!isMountedRef.current) return;

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error("The script is too long or triggers a safety filter for audio output.");

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const rawBytes = decodeBase64(audioData);
      const audioBuffer = await decodeAudioData(rawBytes, audioContextRef.current, 24000);
      
      if (!isMountedRef.current) return;

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        if (isMountedRef.current) setIsPlaying(false);
      };
      
      sourceNodeRef.current = source;
      source.start();
      setIsPlaying(true);

    } catch (err: any) {
      console.error("Preview Error:", err);
      if (isMountedRef.current) {
        setError(err.message || "Failed to generate speech. Try a shorter segment.");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  return (
    <div className="w-full bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700">
            <div className="relative group w-full sm:w-auto">
                <select
                    value={selectedVoiceName}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                    className="appearance-none w-full sm:w-48 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 py-2 pl-3 pr-10 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-600 cursor-pointer transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    disabled={isLoading || isPlaying}
                >
                    {voices.map(voice => (
                        <option key={voice.name} value={voice.name}>
                            {voice.name} ({voice.analysis.gender})
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
                    <ChevronDown size={14} />
                </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
                {(!hasApiKey && !process.env.API_KEY) && (
                    <button 
                        onClick={handleOpenKeyPicker}
                        className="flex-1 sm:flex-none px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                    >
                        <Key size={14} /> Set API Key
                    </button>
                )}
                <button
                    onClick={handlePlay}
                    disabled={isLoading}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all transform active:scale-95 ${
                        isPlaying 
                        ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-600 shadow-inner' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
                    } ${isLoading ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                    {isLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : isPlaying ? (
                        <Square size={16} className="fill-current" />
                    ) : (
                        <Play size={16} className="fill-current" />
                    )}
                    <span>{isLoading ? 'Wait...' : isPlaying ? 'Stop' : 'Listen'}</span>
                </button>
            </div>
        </div>

        <div 
            className={`h-24 relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 overflow-hidden group ${isLoading ? 'cursor-not-allowed' : 'cursor-pointer'}`} 
            onClick={handlePlay}
        >
             <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }}></div>
            
             <div className="w-full h-full absolute inset-0 flex items-center justify-center pointer-events-none">
                 {isPlaying ? (
                     <div className="w-full h-full opacity-80">
                         <AudioVisualizer isPlaying={true} color="#6366f1" />
                     </div>
                 ) : (
                     <div className="flex flex-col items-center gap-2 text-zinc-300 dark:text-zinc-600">
                         <Volume2 size={24} />
                         <span className="text-xs font-bold uppercase tracking-widest">Preview Voice</span>
                     </div>
                 )}
             </div>

             {error && (
                 <div className="absolute inset-0 bg-red-50 dark:bg-zinc-900 flex items-center justify-center text-red-600 dark:text-red-400 gap-2 text-xs font-bold px-4 text-center z-20 border border-red-100 dark:border-red-900/30">
                     <AlertCircle size={14} />
                     <span>{error}</span>
                 </div>
             )}
        </div>
    </div>
  );
};

export default AiTtsPreview;
