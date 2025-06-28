import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiPlay, FiPause, FiSquare, FiVolumeX, FiVolume2, FiSettings, FiZap, FiMusic, FiClock } = FiIcons;

const ToneGenerator = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frequency, setFrequency] = useState(1000);
  const [frequencyInput, setFrequencyInput] = useState('1000');
  const [volume, setVolume] = useState(0.1);
  const [waveform, setWaveform] = useState('sine');
  const [channel, setChannel] = useState('both');
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepProgress, setSweepProgress] = useState(0);
  
  // Noise generator states
  const [isNoiseActive, setIsNoiseActive] = useState(false);
  const [noiseType, setNoiseType] = useState('white');
  
  // Dub Siren states
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [sirenType, setSirenType] = useState('sweep');
  const [delayFeedback, setDelayFeedback] = useState(50);
  const [delayTime, setDelayTime] = useState(250);
  const [useBPM, setUseBPM] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [delayDivision, setDelayDivision] = useState('1/4');
  const [delayStyle, setDelayStyle] = useState('regular');
  const [tapTimes, setTapTimes] = useState([]);

  const audioContextRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  const pannerRef = useRef(null);
  const sweepIntervalRef = useRef(null);
  
  // Noise generator refs
  const noiseSourceRef = useRef(null);
  const noiseGainRef = useRef(null);
  const noiseBufferRef = useRef(null);
  
  // Dub Siren refs
  const sirenOscRef = useRef(null);
  const sirenGainRef = useRef(null);
  const delayNodeRef = useRef(null);
  const feedbackGainRef = useRef(null);
  const sirenIntervalRef = useRef(null);

  const presetFrequencies = [0, 10, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 10000, 16000, 20000];

  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      gainNodeRef.current = audioContextRef.current.createGain();
      pannerRef.current = audioContextRef.current.createStereoPanner();
      
      // Noise generator setup
      noiseGainRef.current = audioContextRef.current.createGain();
      noiseGainRef.current.gain.value = 0;
      
      // Dub Siren setup with delay
      sirenGainRef.current = audioContextRef.current.createGain();
      sirenGainRef.current.gain.value = 0;
      delayNodeRef.current = audioContextRef.current.createDelay(2.0);
      feedbackGainRef.current = audioContextRef.current.createGain();
      
      // Connect delay chain
      sirenGainRef.current.connect(delayNodeRef.current);
      delayNodeRef.current.connect(feedbackGainRef.current);
      feedbackGainRef.current.connect(delayNodeRef.current);
      delayNodeRef.current.connect(pannerRef.current);
      sirenGainRef.current.connect(pannerRef.current);
      
      gainNodeRef.current.connect(pannerRef.current);
      noiseGainRef.current.connect(pannerRef.current);
      pannerRef.current.connect(audioContextRef.current.destination);
    }
  }, []);

  const updatePanning = useCallback(() => {
    if (pannerRef.current) {
      switch (channel) {
        case 'left':
          pannerRef.current.pan.value = -1;
          break;
        case 'right':
          pannerRef.current.pan.value = 1;
          break;
        default:
          pannerRef.current.pan.value = 0;
      }
    }
  }, [channel]);

  // Noise generation functions
  const createNoiseBuffer = useCallback((type, length = 2) => {
    const sampleRate = audioContextRef.current.sampleRate;
    const bufferSize = sampleRate * length;
    const buffer = audioContextRef.current.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    switch (type) {
      case 'white':
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        break;
      case 'pink':
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          data[i] *= 0.11;
          b6 = white * 0.115926;
        }
        break;
      case 'brown':
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5;
        }
        break;
      case 'green':
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.sin(2 * Math.PI * 528 * i / sampleRate) * (Math.random() * 0.1);
        }
        break;
    }
    
    return buffer;
  }, []);

  const startNoise = useCallback((type) => {
    if (noiseSourceRef.current) {
      noiseSourceRef.current.stop();
    }

    initializeAudioContext();
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    noiseBufferRef.current = createNoiseBuffer(type);
    noiseSourceRef.current = audioContextRef.current.createBufferSource();
    noiseSourceRef.current.buffer = noiseBufferRef.current;
    noiseSourceRef.current.loop = true;
    noiseSourceRef.current.connect(noiseGainRef.current);
    noiseGainRef.current.gain.setValueAtTime(volume * 0.3, audioContextRef.current.currentTime);
    noiseSourceRef.current.start();
    
    setIsNoiseActive(true);
  }, [createNoiseBuffer, volume]);

  const stopNoise = useCallback(() => {
    if (noiseSourceRef.current) {
      noiseSourceRef.current.stop();
      noiseSourceRef.current = null;
    }
    if (noiseGainRef.current) {
      noiseGainRef.current.gain.setValueAtTime(0, audioContextRef.current?.currentTime || 0);
    }
    setIsNoiseActive(false);
  }, []);

  // Dub Siren functions
  const calculateDelayTime = useCallback(() => {
    if (!useBPM) return delayTime / 1000;
    
    const beatTime = 60 / bpm;
    const divisions = {
      '1': beatTime * 4,
      '1/2': beatTime * 2,
      '1/4': beatTime,
      '1/8': beatTime / 2,
      '1/16': beatTime / 4,
      '1/32': beatTime / 8
    };
    
    let time = divisions[delayDivision] || beatTime;
    
    if (delayStyle === 'dotted') {
      time *= 1.5;
    } else if (delayStyle === 'triplet') {
      time *= 2/3;
    }
    
    return Math.min(time, 2.0);
  }, [useBPM, delayTime, bpm, delayDivision, delayStyle]);

  const startSiren = useCallback((type) => {
    initializeAudioContext();
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (sirenOscRef.current) {
      sirenOscRef.current.stop();
    }

    sirenOscRef.current = audioContextRef.current.createOscillator();
    sirenOscRef.current.type = 'sawtooth';
    sirenOscRef.current.connect(sirenGainRef.current);
    
    // Setup delay
    const delayTimeValue = calculateDelayTime();
    delayNodeRef.current.delayTime.setValueAtTime(delayTimeValue, audioContextRef.current.currentTime);
    feedbackGainRef.current.gain.setValueAtTime(delayFeedback / 100, audioContextRef.current.currentTime);
    
    sirenGainRef.current.gain.setValueAtTime(volume * 0.5, audioContextRef.current.currentTime);
    
    const startFreq = 200;
    const endFreq = 1000;
    const now = audioContextRef.current.currentTime;
    
    switch (type) {
      case 'sweep':
        sirenOscRef.current.frequency.setValueAtTime(startFreq, now);
        sirenOscRef.current.frequency.exponentialRampToValueAtTime(endFreq, now + 2);
        sirenOscRef.current.frequency.exponentialRampToValueAtTime(startFreq, now + 4);
        break;
      case 'chop':
        sirenOscRef.current.frequency.setValueAtTime(startFreq, now);
        let chopTime = now;
        for (let i = 0; i < 20; i++) {
          const freq = i % 2 === 0 ? startFreq : endFreq;
          sirenOscRef.current.frequency.setValueAtTime(freq, chopTime);
          chopTime += 0.2;
        }
        break;
      case 'siren':
        sirenOscRef.current.frequency.setValueAtTime(startFreq, now);
        let sirenTime = now;
        for (let i = 0; i < 10; i++) {
          sirenOscRef.current.frequency.exponentialRampToValueAtTime(endFreq, sirenTime + 0.5);
          sirenOscRef.current.frequency.exponentialRampToValueAtTime(startFreq, sirenTime + 1);
          sirenTime += 1;
        }
        break;
    }
    
    sirenOscRef.current.start();
    setIsSirenActive(true);

    // Auto-stop after pattern completes
    setTimeout(() => {
      stopSiren();
    }, type === 'chop' ? 4000 : type === 'siren' ? 10000 : 4000);
  }, [volume, calculateDelayTime, delayFeedback]);

  const stopSiren = useCallback(() => {
    if (sirenOscRef.current) {
      sirenOscRef.current.stop();
      sirenOscRef.current = null;
    }
    if (sirenGainRef.current) {
      sirenGainRef.current.gain.setValueAtTime(0, audioContextRef.current?.currentTime || 0);
    }
    setIsSirenActive(false);
  }, []);

  const tapTempo = useCallback(() => {
    const now = Date.now();
    const newTapTimes = [...tapTimes, now].slice(-4);
    setTapTimes(newTapTimes);
    
    if (newTapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTapTimes.length; i++) {
        intervals.push(newTapTimes[i] - newTapTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      const newBpm = Math.round(60000 / avgInterval);
      if (newBpm >= 40 && newBpm <= 200) {
        setBpm(newBpm);
      }
    }
  }, [tapTimes]);

  const handleFrequencyInputChange = useCallback((value) => {
    setFrequencyInput(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 20000) {
      setFrequency(numValue);
    }
  }, []);

  const startTone = useCallback(() => {
    initializeAudioContext();
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
    }

    // Handle 0 Hz case - use very low frequency instead
    const actualFrequency = frequency === 0 ? 0.1 : frequency;

    oscillatorRef.current = audioContextRef.current.createOscillator();
    oscillatorRef.current.type = waveform;
    oscillatorRef.current.frequency.setValueAtTime(actualFrequency, audioContextRef.current.currentTime);
    
    gainNodeRef.current.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
    updatePanning();
    
    oscillatorRef.current.connect(gainNodeRef.current);
    oscillatorRef.current.start();
    
    setIsPlaying(true);
  }, [frequency, volume, waveform, initializeAudioContext, updatePanning]);

  const stopTone = useCallback(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
    setIsPlaying(false);
    stopSweep();
  }, []);

  const startSweep = useCallback(() => {
    if (isSweeping) return;
    
    setIsSweeping(true);
    setSweepProgress(0);
    
    const startFreq = 0;
    const endFreq = 20000;
    const duration = 10000;
    const steps = 100;
    const stepDuration = duration / steps;
    
    let currentStep = 0;
    
    const sweep = () => {
      if (currentStep >= steps) {
        stopSweep();
        return;
      }
      
      const progress = currentStep / steps;
      // Use exponential curve for better frequency perception, but handle 0Hz case
      let currentFreq;
      if (progress === 0) {
        currentFreq = 0;
      } else {
        const minFreq = 0.1; // Minimum audible frequency for calculation
        currentFreq = minFreq * Math.pow((endFreq / minFreq), progress);
      }
      
      setFrequency(Math.round(currentFreq * 10) / 10); // Round to 1 decimal
      setFrequencyInput((Math.round(currentFreq * 10) / 10).toString());
      setSweepProgress(progress * 100);
      
      if (oscillatorRef.current) {
        const actualFreq = currentFreq === 0 ? 0.1 : currentFreq;
        oscillatorRef.current.frequency.setValueAtTime(
          actualFreq, 
          audioContextRef.current.currentTime
        );
      }
      
      currentStep++;
    };
    
    startTone();
    sweepIntervalRef.current = setInterval(sweep, stepDuration);
  }, [isSweeping, startTone]);

  const stopSweep = useCallback(() => {
    if (sweepIntervalRef.current) {
      clearInterval(sweepIntervalRef.current);
      sweepIntervalRef.current = null;
    }
    setIsSweeping(false);
    setSweepProgress(0);
  }, []);

  const formatFrequency = (freq) => {
    if (freq === 0) {
      return '0Hz (DC)';
    }
    if (freq >= 1000) {
      return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}kHz`;
    }
    return `${freq}Hz`;
  };

  useEffect(() => {
    updatePanning();
  }, [channel, updatePanning]);

  useEffect(() => {
    if (isPlaying && oscillatorRef.current && !isSweeping) {
      const actualFreq = frequency === 0 ? 0.1 : frequency;
      oscillatorRef.current.frequency.setValueAtTime(actualFreq, audioContextRef.current.currentTime);
    }
  }, [frequency, isPlaying, isSweeping]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume, audioContextRef.current?.currentTime || 0);
    }
    if (noiseGainRef.current && isNoiseActive) {
      noiseGainRef.current.gain.setValueAtTime(volume * 0.3, audioContextRef.current?.currentTime || 0);
    }
    if (sirenGainRef.current && isSirenActive) {
      sirenGainRef.current.gain.setValueAtTime(volume * 0.5, audioContextRef.current?.currentTime || 0);
    }
  }, [volume, isNoiseActive, isSirenActive]);

  useEffect(() => {
    if (delayNodeRef.current && feedbackGainRef.current) {
      const delayTimeValue = calculateDelayTime();
      delayNodeRef.current.delayTime.setValueAtTime(delayTimeValue, audioContextRef.current?.currentTime || 0);
      feedbackGainRef.current.gain.setValueAtTime(delayFeedback / 100, audioContextRef.current?.currentTime || 0);
    }
  }, [calculateDelayTime, delayFeedback]);

  useEffect(() => {
    return () => {
      stopTone();
      stopNoise();
      stopSiren();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopTone, stopNoise, stopSiren]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-8"
        >
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Audio Test Tone Generator</h1>
            <p className="text-purple-200">Professional frequency testing, noise generation, and dub siren effects</p>
          </div>

          {/* Main Controls */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
            {/* Frequency Control */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/5 rounded-xl p-6 border border-white/10"
            >
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <SafeIcon icon={FiSettings} className="text-purple-400" />
                Frequency Control
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-purple-200 text-sm mb-2">
                    Frequency: {formatFrequency(frequency)}
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={frequencyInput}
                      onChange={(e) => handleFrequencyInputChange(e.target.value)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="1000"
                      disabled={isSweeping}
                    />
                    <span className="text-purple-200 text-sm self-center">Hz</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20000"
                    step="0.1"
                    value={frequency}
                    onChange={(e) => {
                      const newFreq = parseFloat(e.target.value);
                      setFrequency(newFreq);
                      setFrequencyInput(newFreq.toString());
                    }}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                    disabled={isSweeping}
                  />
                  <div className="flex justify-between text-xs text-purple-300 mt-1">
                    <span>0Hz</span>
                    <span>20kHz</span>
                  </div>
                </div>

                <div>
                  <label className="block text-purple-200 text-sm mb-2">
                    Volume: {Math.round(volume * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 text-sm mb-2">Waveform</label>
                  <select
                    value={waveform}
                    onChange={(e) => setWaveform(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="sine">Sine Wave</option>
                    <option value="square">Square Wave</option>
                    <option value="sawtooth">Sawtooth Wave</option>
                    <option value="triangle">Triangle Wave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-purple-200 text-sm mb-2">Stereo Channel</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'left', label: 'Left', icon: FiVolumeX },
                      { value: 'both', label: 'Both', icon: FiVolume2 },
                      { value: 'right', label: 'Right', icon: FiVolumeX }
                    ].map((option) => (
                      <motion.button
                        key={option.value}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setChannel(option.value)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          channel === option.value
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/10 text-purple-200 hover:bg-white/20'
                        }`}
                      >
                        <SafeIcon icon={option.icon} className="text-xs" />
                        {option.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Playback Controls */}
            <motion.div
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/5 rounded-xl p-6 border border-white/10"
            >
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <SafeIcon icon={FiPlay} className="text-green-400" />
                Playback Controls
              </h3>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={isPlaying ? stopTone : startTone}
                    disabled={isSweeping}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors ${
                      isPlaying
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <SafeIcon icon={isPlaying ? FiPause : FiPlay} />
                    {isPlaying ? 'Stop' : 'Play'}
                  </motion.button>
                </div>

                <div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={isSweeping ? stopSweep : startSweep}
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors ${
                      isSweeping
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    <SafeIcon icon={isSweeping ? FiSquare : FiPlay} />
                    {isSweeping ? 'Stop Sweep' : 'Frequency Sweep (0Hz-20kHz)'}
                  </motion.button>
                  
                  {isSweeping && (
                    <div className="mt-2">
                      <div className="w-full bg-white/20 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-100"
                          style={{ width: `${sweepProgress}%` }}
                        />
                      </div>
                      <p className="text-center text-purple-200 text-sm mt-1">
                        {sweepProgress.toFixed(1)}% Complete
                      </p>
                    </div>
                  )}
                </div>

                {/* Noise Generator */}
                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                    <SafeIcon icon={FiZap} className="text-yellow-400" />
                    Noise Generator
                  </h4>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {['white', 'pink', 'brown', 'green'].map((noise) => (
                      <motion.button
                        key={noise}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (isNoiseActive && noiseType === noise) {
                            stopNoise();
                          } else {
                            setNoiseType(noise);
                            startNoise(noise);
                          }
                        }}
                        className={`py-2 px-3 rounded-lg font-medium transition-colors capitalize text-sm ${
                          isNoiseActive && noiseType === noise
                            ? 'bg-yellow-500 text-white'
                            : 'bg-white/10 text-purple-200 hover:bg-white/20'
                        }`}
                      >
                        {noise} Noise
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Dub Siren */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/5 rounded-xl p-6 border border-white/10"
            >
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <SafeIcon icon={FiMusic} className="text-orange-400" />
                Dub Siren
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {['sweep', 'chop', 'siren'].map((type) => (
                    <motion.button
                      key={type}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (isSirenActive) {
                          stopSiren();
                        } else {
                          setSirenType(type);
                          startSiren(type);
                        }
                      }}
                      className={`py-2 px-3 rounded-lg font-medium transition-colors capitalize text-sm ${
                        isSirenActive && sirenType === type
                          ? 'bg-orange-500 text-white'
                          : 'bg-white/10 text-purple-200 hover:bg-white/20'
                      }`}
                    >
                      {type}
                    </motion.button>
                  ))}
                </div>

                {/* Delay Controls */}
                <div className="border-t border-white/10 pt-4">
                  <h4 className="text-sm font-medium text-purple-200 mb-3">Analog Tape Delay</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-purple-200 text-xs mb-1">
                        Feedback: {delayFeedback}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={delayFeedback}
                        onChange={(e) => setDelayFeedback(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setUseBPM(!useBPM)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          useBPM
                            ? 'bg-orange-500 text-white'
                            : 'bg-white/10 text-purple-200 hover:bg-white/20'
                        }`}
                      >
                        BPM
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={tapTempo}
                        className="flex-1 px-3 py-1 rounded text-xs font-medium bg-white/10 text-purple-200 hover:bg-white/20 transition-colors flex items-center justify-center gap-1"
                      >
                        <SafeIcon icon={FiClock} className="text-xs" />
                        Tap {bpm} BPM
                      </motion.button>
                    </div>

                    {useBPM ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-1">
                          {['1', '1/2', '1/4', '1/8', '1/16', '1/32'].map((div) => (
                            <motion.button
                              key={div}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setDelayDivision(div)}
                              className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                                delayDivision === div
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
                              }`}
                            >
                              {div}
                            </motion.button>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {['regular', 'dotted', 'triplet'].map((style) => (
                            <motion.button
                              key={style}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setDelayStyle(style)}
                              className={`py-1 px-2 rounded text-xs font-medium transition-colors capitalize ${
                                delayStyle === style
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
                              }`}
                            >
                              {style}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-purple-200 text-xs mb-1">
                          Delay Time: {delayTime}ms
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="2000"
                          value={delayTime}
                          onChange={(e) => setDelayTime(parseInt(e.target.value))}
                          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Preset Frequencies */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 rounded-xl p-6 border border-white/10"
          >
            <h3 className="text-xl font-semibold text-white mb-4">Preset Test Frequencies</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 xl:grid-cols-13 gap-3">
              {presetFrequencies.map((freq) => (
                <motion.button
                  key={freq}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setFrequency(freq);
                    setFrequencyInput(freq.toString());
                  }}
                  disabled={isSweeping}
                  className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                    frequency === freq
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {formatFrequency(freq)}
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Warning */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4"
          >
            <p className="text-yellow-200 text-sm text-center">
              ⚠️ Warning: Start with low volume levels to protect your hearing. High frequencies, noise, and delay feedback can cause hearing damage.
            </p>
          </motion.div>
        </motion.div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          border: 2px solid #ffffff;
        }
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          border: 2px solid #ffffff;
        }
      `}</style>
    </div>
  );
};

export default ToneGenerator;