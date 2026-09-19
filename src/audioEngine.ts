import { EQ_FREQUENCIES } from '../shared/settings';
import type { Equalizer } from '../shared/types';

type AudioContextConstructor = typeof AudioContext;

function contextClass(): AudioContextConstructor | undefined {
  return (
    window.AudioContext ??
    (window as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext
  );
}

/**
 * Web Audio graph shared by both player elements: source → preamp → 10 biquads →
 * compressor → gain. Built lazily because Safari and Android only allow a context
 * after a user gesture, and the player must keep working without Web Audio at all.
 */
export class AudioEngine {
  private context?: AudioContext;
  private sources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private preamp?: GainNode;
  private filters: BiquadFilterNode[] = [];
  private compressor?: DynamicsCompressorNode;
  private output?: GainNode;
  private equalizer: Equalizer = {
    enabled: false,
    preset: 'flat',
    preamp: 0,
    bands: EQ_FREQUENCIES.map(() => 0),
  };
  private normalize = false;
  supported = !!contextClass();
  failed = false;

  private build() {
    if (this.context || this.failed) return this.context;
    const Constructor = contextClass();
    if (!Constructor) {
      this.failed = true;
      return undefined;
    }
    try {
      const context = new Constructor();
      const preamp = context.createGain();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;
      const output = context.createGain();
      this.filters = EQ_FREQUENCIES.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type =
          index === 0
            ? 'lowshelf'
            : index === EQ_FREQUENCIES.length - 1
              ? 'highshelf'
              : 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1.1;
        filter.gain.value = 0;
        return filter;
      });
      let node: AudioNode = preamp;
      for (const filter of this.filters) {
        node.connect(filter);
        node = filter;
      }
      node.connect(compressor);
      compressor.connect(output);
      output.connect(context.destination);
      this.context = context;
      this.preamp = preamp;
      this.compressor = compressor;
      this.output = output;
      this.apply();
      return context;
    } catch {
      this.failed = true;
      this.supported = false;
      return undefined;
    }
  }

  private apply() {
    if (!this.context || !this.preamp || !this.compressor) return;
    const { enabled, bands, preamp } = this.equalizer;
    this.filters.forEach((filter, index) => {
      filter.gain.value = enabled ? (bands[index] ?? 0) : 0;
    });
    // Compressor ratio 1 is a bypass, so normalization can share one graph.
    this.compressor.ratio.value = this.normalize ? 4 : 1;
    this.compressor.threshold.value = this.normalize ? -24 : 0;
    this.preamp.gain.value = enabled ? 10 ** (preamp / 20) : 1;
  }

  attach(element: HTMLMediaElement) {
    if (!this.equalizer.enabled && !this.normalize) return;
    const context = this.build();
    if (!context || !this.preamp) return;
    if (this.sources.has(element)) return;
    try {
      const source = context.createMediaElementSource(element);
      source.connect(this.preamp);
      this.sources.set(element, source);
    } catch {
      this.failed = true;
    }
  }

  update(equalizer: Equalizer, normalize: boolean) {
    this.equalizer = equalizer;
    this.normalize = normalize;
    if (equalizer.enabled || normalize) this.build();
    this.apply();
  }

  /** Browsers suspend contexts until a gesture; playback calls this on every play. */
  resume() {
    if (this.context?.state === 'suspended') void this.context.resume();
  }

  get active() {
    return !!this.context && (this.equalizer.enabled || this.normalize);
  }
}
