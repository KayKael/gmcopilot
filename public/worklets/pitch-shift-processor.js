/**
 * Pitch shifter simples (dois leitores com crossfade num buffer circular).
 * Entrada mono → saída estéreo (L = R) para ouvir nos dois lados dos auscultadores.
 * parameter: pitchRatio = 2^(semitones/12)
 */
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "pitchRatio",
        defaultValue: 1,
        minValue: 0.25,
        maxValue: 4,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.bufferSize = 8192;
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos1 = 0;
    this.readPos2 = this.bufferSize / 2;
    this.fade = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const outL = outputs[0]?.[0];
    const outR = outputs[0]?.[1];
    if (!input || !outL) return true;

    const ratio = parameters.pitchRatio[0] ?? 1;
    const size = this.bufferSize;
    const half = size / 2;

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writePos] = input[i];
      this.writePos = (this.writePos + 1) % size;

      const i1 = Math.floor(this.readPos1) % size;
      const i2 = Math.floor(this.readPos2) % size;
      const f = this.fade;
      const sample = this.buffer[i1] * (1 - f) + this.buffer[i2] * f;
      outL[i] = sample;
      if (outR) outR[i] = sample;

      this.readPos1 += ratio;
      this.readPos2 += ratio;
      if (this.readPos1 >= size) this.readPos1 -= size;
      if (this.readPos2 >= size) this.readPos2 -= size;

      const dist1 = (this.writePos - this.readPos1 + size) % size;
      if (dist1 < 64 || dist1 > size - 64) {
        this.fade = Math.min(1, this.fade + 0.02);
        if (this.fade >= 1) {
          this.readPos1 = (this.writePos + half) % size;
          this.fade = 0;
          const tmp = this.readPos1;
          this.readPos1 = this.readPos2;
          this.readPos2 = tmp;
        }
      }
    }
    return true;
  }
}

registerProcessor("pitch-shift-processor", PitchShiftProcessor);
