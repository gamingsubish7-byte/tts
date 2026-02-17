
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { X, Play, Square, Loader2, Download, AudioLines, ChevronDown, Wand2, Volume2, AlertCircle, Cpu, Globe, Key } from 'lucide-react';
import { Voice } from '../types';
import AudioVisualizer from './AudioVisualizer';

interface TtsToolProps {
  voices: Voice[];
  onClose: () => void;
}

type TtsEngine = 'gemini' | 'system';

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

function createWavFile(audioBuffer: AudioBuffer): Blob {
  const length = audioBuffer.length * audioBuffer.numberOfChannels * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  const sampleRate = audioBuffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4;
  writeString(view, pos, 'WAVE'); pos += 4;
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4;
  view.setUint16(pos, 1, true); pos += 2;
  view.setUint16(pos, audioBuffer.numberOfChannels, true); pos += 2;
  view.setUint32(pos, sampleRate, true); pos += 4;
  view.setUint32(pos, sampleRate * audioBuffer.numberOfChannels * 2, true); pos += 4;
  view.setUint16(pos, audioBuffer.numberOfChannels * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2;
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

const TtsTool: React.FC<TtsToolProps> = ({ voices, onClose }) => {
  const [text, setText] = useState('Hello! I am a high-quality AI voice. You can choose between Gemini AI or your System Voice.');
  const [engine, setEngine] = useState<TtsEngine>('gemini');
  const [selectedVoiceName, setSelectedVoiceName] = useState(voices[0]?.name || '');
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoiceURI, setSelectedSystemVoiceURI] = useState('');
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAudio, setGeneratedAudio] = useState<AudioBuffer | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const MAX_WORDS = 20000;
  const wordCount = useMemo(() => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [text]);

  useEffect(() => {
    // Load system voices
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setSystemVoices(v);
      if (v.length > 0 && !selectedSystemVoiceURI) {
        setSelectedSystemVoiceURI(v[0].voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Check for API key (Veo/Hosted style)
    const checkKey = async () => {
      if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
        const hasSelected = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(hasSelected);
      } else if (process.env.API_KEY) {
        setHasApiKey(true);
      }
    };
    checkKey();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopAudio();
      if (audioContextRef.current) audioContextRef.current.close();
      window.speechSynthesis.cancel();
    };
  }, [onClose]);

  const stopAudio = () => {
    if (engine === 'gemini') {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch (e) {}
        sourceNodeRef.current = null;
      }
    } else {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  const handleOpenKeyPicker = async () => {
    if (typeof (window as any).aistudio?.openSelectKey === 'function') {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    // Strict word limit check
    if (wordCount > MAX_WORDS) {
      setError("max limit is 20k words");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setGeneratedAudio(null);
    stopAudio();
    
    if (engine === 'system') {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = systemVoices.find(v => v.voiceURI === selectedSystemVoiceURI);
        if (voice) utterance.voice = voice;
        utterance.onstart = () => setIsPlaying(true);
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => {
          setError("System Speech Synthesis failed.");
          setIsPlaying(false);
        };
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        setError("Speech synthesis not supported on this browser.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Gemini Engine
    try {
      if (!process.env.API_KEY && !hasApiKey) {
        setError("API Key is missing. Please select one or use System Voice.");
        setIsLoading(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: text }] },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoiceName } },
          },
        },
      });
      
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (!audioData) {
        const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
           throw new Error("API error: The prompt is too long or triggers a filter for audio output.");
        }
        throw new Error("No audio data received. Try splitting your text into smaller parts.");
      }

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const rawBytes = decodeBase64(audioData);
      const audioBuffer = await decodeAudioData(rawBytes, audioContextRef.current, 24000);
      setGeneratedAudio(audioBuffer);
      
      playBuffer(audioBuffer);

    } catch (err: any) {
      console.error("TTS Error:", err);
      let msg = err.message || "An unexpected error occurred.";
      if (msg.includes("not supported by the AudioOut model")) {
        msg = "Script is too long for the AI engine. Use 'System Voice' for large texts.";
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const playBuffer = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;
    stopAudio();
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => setIsPlaying(false);
    sourceNodeRef.current = source;
    source.start();
    setIsPlaying(true);
  };

  const handleDownload = () => {
    if (!generatedAudio) return;
    const wavBlob = createWavFile(generatedAudio);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-gen-${selectedVoiceName}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedGeminiVoice = voices.find(v => v.name === selectedVoiceName);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md animate-fade-in" onClick={onClose}></div>
      
      <div ref={modalRef} className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 sm:p-8 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                    <AudioLines size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">TTS Studio</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Transform your words into audio</p>
                </div>
            </div>
            <button 
               onClick={onClose}
               className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 dark:text-zinc-500 transition-colors"
            >
               <X size={20} />
            </button>
        </div>

        {/* Engine Toggle */}
        <div className="px-8 pt-6">
            <div className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl flex gap-1">
                <button 
                    onClick={() => { setEngine('gemini'); stopAudio(); setGeneratedAudio(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${engine === 'gemini' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                >
                    <Wand2 size={16} /> AI Engine
                </button>
                <button 
                    onClick={() => { setEngine('system'); stopAudio(); setGeneratedAudio(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${engine === 'system' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                >
                    <Cpu size={16} /> System Voice
                </button>
            </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
            
            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Script Content</label>
                    <div className="flex gap-4">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${wordCount > MAX_WORDS ? 'bg-red-500 text-white font-bold animate-pulse' : 'text-zinc-400 dark:text-zinc-600'}`}>
                            {wordCount.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
                        </span>
                    </div>
                </div>
                <div className="relative group">
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Type or paste your script here..."
                        className={`w-full h-40 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-5 text-lg text-zinc-900 dark:text-white placeholder-zinc-300 dark:placeholder-zinc-700 border focus:ring-4 transition-all outline-none resize-none leading-relaxed ${wordCount > MAX_WORDS ? 'border-red-500 focus:ring-red-500/10 focus:border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-zinc-200 dark:border-zinc-800 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900'}`}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Speaker Voice</label>
                    <div className="relative">
                        {engine === 'gemini' ? (
                            <select 
                                value={selectedVoiceName}
                                onChange={(e) => { setSelectedVoiceName(e.target.value); setGeneratedAudio(null); stopAudio(); }}
                                className="w-full appearance-none bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all hover:border-zinc-300 dark:hover:border-zinc-600"
                            >
                                {voices.map(v => (
                                    <option key={v.name} value={v.name}>{v.name} ({v.analysis.gender})</option>
                                ))}
                            </select>
                        ) : (
                            <select 
                                value={selectedSystemVoiceURI}
                                onChange={(e) => setSelectedSystemVoiceURI(e.target.value)}
                                className="w-full appearance-none bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all hover:border-zinc-300 dark:hover:border-zinc-600"
                            >
                                {systemVoices.map(v => (
                                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                                ))}
                            </select>
                        )}
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                </div>

                {engine === 'gemini' && selectedGeminiVoice && (
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 shrink-0">
                            <img src={selectedGeminiVoice.imageUrl} alt={selectedGeminiVoice.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-zinc-900 dark:text-white truncate">{selectedGeminiVoice.name}</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold uppercase">
                                {selectedGeminiVoice.pitch}
                            </span>
                        </div>
                    </div>
                )}
                
                {engine === 'system' && (
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 flex items-center gap-4 text-zinc-500">
                        <Globe size={24} className="shrink-0" />
                        <div className="text-xs">
                            <p className="font-bold text-zinc-900 dark:text-white">Local Synthesis</p>
                            <p>Built-in browser engine. No API needed.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* API Key Assistant for Hosting */}
            {engine === 'gemini' && !hasApiKey && !process.env.API_KEY && (
                <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-5 rounded-2xl flex flex-col gap-3 text-sm border border-amber-100 dark:border-amber-900/30">
                    <div className="flex items-center gap-3 font-bold">
                        <Key size={18} />
                        <span>AI Engine Requires Authentication</span>
                    </div>
                    <p className="opacity-80">Since you are on a live host, you must provide your own API key to use AI voices, or switch to the <b>System Voice</b> engine above.</p>
                    <button 
                        onClick={handleOpenKeyPicker}
                        className="self-start px-5 py-2.5 bg-amber-100 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded-xl font-bold hover:bg-amber-200 dark:hover:bg-amber-700 transition-colors shadow-sm"
                    >
                        Select My API Key
                    </button>
                </div>
            )}

            {(generatedAudio || (engine === 'system' && isPlaying)) && (
                <div className="bg-zinc-900 rounded-3xl p-6 relative overflow-hidden group">
                     <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '12px 12px' }}></div>
                     
                     <div className="relative z-10 flex flex-col items-center">
                        <div className="w-full h-24 mb-4">
                            <AudioVisualizer isPlaying={isPlaying} color="#6366f1" />
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => isPlaying ? stopAudio() : (engine === 'gemini' ? playBuffer(generatedAudio!) : handleGenerate())}
                                className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-zinc-900 shadow-xl hover:scale-105 transition-transform"
                            >
                                {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                            </button>
                            {generatedAudio && engine === 'gemini' && (
                                <button 
                                    onClick={handleDownload}
                                    className="px-6 rounded-full bg-zinc-800 text-white flex items-center gap-2 text-sm font-medium hover:bg-zinc-700 transition-colors"
                                >
                                    <Download size={18} />
                                    Download WAV
                                </button>
                            )}
                        </div>
                     </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm border border-red-100 dark:border-red-900/30 animate-fade-in">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}
        </div>

        <div className="p-6 sm:p-8 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            <button 
                onClick={handleGenerate}
                disabled={isLoading || isPlaying || !text.trim() || wordCount > MAX_WORDS || (engine === 'gemini' && !hasApiKey && !process.env.API_KEY)}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-3 transition-all active:scale-95"
            >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : (isPlaying ? <Volume2 size={20} /> : <Wand2 size={20} />)}
                {isLoading ? 'Synthesizing...' : (isPlaying ? 'Speaking...' : (engine === 'gemini' ? 'Generate AI Voice' : 'Start Speaking'))}
            </button>
        </div>
      </div>
    </div>
  );
};

export default TtsTool;
