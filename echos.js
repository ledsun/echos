function writeString(view, offset, string) {
  // https://medium.com/better-programming/how-to-iterate-through-strings-in-javascript-65c51bb3ace5
  // 文字列はfor-ofやforEachでイテレートできる
  [...string].forEach((char, index) => {
    view.setUint8(offset + index, char.charCodeAt(0))
  })
};

// 8bitの情報を16bitに変換する
function floatTo16BitPCM(output, offset, input) {
  input.forEach((datum, index) => {
    // 何しているのか全然わからない
    const s = Math.max(-1, Math.min(1, datum));
    const pcm = s < 0 ? s * 0x8000 : s * 0x7FFF

    // 2バイトずつ進めて書き込む
    output.setInt16(offset + (index * 2), pcm, true);
  })
};

function encodeToWAV(samples, sampleRate) {
  const headerSize = 44;
  // 8bitを16bitに変換するので、データサイズは2倍になる
  const outputDataLength = samples.length * 2;
  const outBuffer = new DataView(new ArrayBuffer(headerSize + outputDataLength));

  writeString(outBuffer, 0, 'RIFF');  // RIFFヘッダ
  outBuffer.setUint32(4, 32 + outputDataLength, true); // これ以降のファイルサイズ
  writeString(outBuffer, 8, 'WAVE'); // WAVEヘッダ
  writeString(outBuffer, 12, 'fmt '); // fmtチャンク
  outBuffer.setUint32(16, 16, true); // fmtチャンクのバイト数
  outBuffer.setUint16(20, 1, true); // フォーマットID
  outBuffer.setUint16(22, 1, true); // チャンネル数
  outBuffer.setUint32(24, sampleRate, true); // サンプリングレート
  outBuffer.setUint32(28, sampleRate * 2, true); // データ速度
  outBuffer.setUint16(32, 2, true); // ブロックサイズ

  // これを8ビットにすればPCM変換が簡単になる？
  outBuffer.setUint16(34, 16, true); // サンプルあたりのビット数
  writeString(outBuffer, 36, 'data'); // dataチャンク
  outBuffer.setUint32(40, outputDataLength, true); // 波形データのバイト数
  floatTo16BitPCM(outBuffer, headerSize, samples); // 波形データ

  return outBuffer;
};

// Float32Arrayの配列を一つのFloat32Arrayにまとめる
function mergeBuffers(audioData) {
  const bufferSize = audioData[0].length
  const totalBufferSize = audioData.length * bufferSize
  const totalBuffer = new Float32Array(totalBufferSize);

  for (let i = 0; i < audioData.length; i++) {
    totalBuffer.set(audioData[i], i * bufferSize)
  }

  return totalBuffer;
};

function toURL(dataview, fileType) {
  const audioBlob = new Blob([dataview], { type: fileType });
  return window.URL.createObjectURL(audioBlob);
}

// 録音データの全体サイズがわからないので、バッファサイズ単位で配列に保存
function copyAudioPerUnit(input, bufferSize, audioData) {
  const bufferData = new Float32Array(bufferSize);
  for (var i = 0; i < bufferSize; i++) {
    bufferData[i] = input[i];
  }

  audioData.push(bufferData);
};

function copyAudioData(audioData, stream) {
  // 音声データをaudioDataに溜め込むScriptProcessorを作る
  // https://developer.mozilla.org/ja/docs/Web/API/AudioContext/createScriptProcessor
  const BUFFER_SIZE = 1024;
  const audioContext = new AudioContext();
  sampleRate = audioContext.sampleRate

  const scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
  scriptProcessor.onaudioprocess = (e) => copyAudioPerUnit(e.inputBuffer.getChannelData(0), BUFFER_SIZE, audioData);

  // ストリームの途中にScriptProcessorを差し込む
  const mediaStreamSource = audioContext.createMediaStreamSource(stream);
  mediaStreamSource.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  return audioContext
};

class Echos {
  async record() {
    this._audioData = []

    // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
    // getUserMediaしたときに録音開始するので、使いにくい。
    // 事前にAudioContextを用意したいです。
    const stream = await window
      .navigator
      .mediaDevices
      .getUserMedia({ audio: true, video: false })

    this._audioContext = copyAudioData(this._audioData, stream);
  }

  freeze() {
    this._audioContext.close()
    const dataview = encodeToWAV(mergeBuffers(this._audioData), this._audioContext.sampleRate);
    return toURL(dataview, 'audio/wav');
  }
}
