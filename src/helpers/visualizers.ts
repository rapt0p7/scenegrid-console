// noinspection D

import { AudioWorkletNode } from 'standardized-audio-context';

// @ts-ignore
import processorUrl from './meter-processor.processor.ts';

import type { AudioWorkletNodeLike, GainNodeLike } from '@webaudio-core';

function map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h /= 360;
    s /= 100;
    l /= 100;
    let r: number, g: number, b: number;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number): number => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

function createOrthoMatrix(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
): Float32Array {
    const rl = right - left;
    const tb = top - bottom;
    const function_ = far - near;
    return new Float32Array([
        2 / rl,
        0,
        0,
        0,
        0,
        2 / tb,
        0,
        0,
        0,
        0,
        -2 / function_,
        0,
        -(right + left) / rl,
        -(top + bottom) / tb,
        -(far + near) / function_,
        1
    ]);
}

function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return null;
    const shaderProgram = gl.createProgram();
    if (!shaderProgram) return null;
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}

function loadShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function drawRect(
    gl: WebGLRenderingContext,
    programInfo: any,
    buffer: WebGLBuffer,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number[]
) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const positions = new Float32Array([x, y, x + w, y, x, y + h, x + w, y + h]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(programInfo.uniformLocations.color, color);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawLine(
    gl: WebGLRenderingContext,
    programInfo: any,
    buffer: WebGLBuffer,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number[],
    weight: number
) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const positions = new Float32Array([x1, y1, x2, y2]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(programInfo.uniformLocations.color, color);
    gl.lineWidth(weight);
    gl.drawArrays(gl.LINES, 0, 2);
}

export async function createFrequencyBarsWithRMS(
    container: HTMLElement,
    gainNode: GainNodeLike,
    width: number = 600,
    height: number = 200
) {
    const { context } = gainNode;
    await context.audioWorklet!.addModule(processorUrl);
    const amplitudeNode: AudioWorkletNodeLike = new AudioWorkletNode!(context, 'meter-processor');
    gainNode.connect(amplitudeNode);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.minDecibels = -120;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;
    gainNode.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    let currentRMS = 0;
    amplitudeNode.port.onmessage = e => {
        currentRMS = e.data.rms;
    };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.append(canvas);
    const gl = canvas.getContext('webgl');
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }
    const vsSource = `
        attribute vec2 a_position;
        uniform mat4 u_projection;
        void main() {
            gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
        }
    `;
    const fsSource = `
        precision mediump float;
        uniform vec4 u_color;
        void main() {
            gl_FragColor = u_color;
        }
    `;
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    if (!shaderProgram) return;
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            position: gl.getAttribLocation(shaderProgram, 'a_position')
        },
        uniformLocations: {
            projection: gl.getUniformLocation(shaderProgram, 'u_projection'),
            color: gl.getUniformLocation(shaderProgram, 'u_color')
        }
    };
    const projectionMatrix = createOrthoMatrix(0, width, height, 0, -1, 1);
    const positionBuffer = gl.createBuffer();
    const numberBars = 32;
    const minFreq = 20;
    const maxFreq = context.sampleRate / 2;
    const ratio = (maxFreq / minFreq) ** (1 / numberBars);
    const peaks: number[] = Array.from({ length: numberBars }).fill(0) as number[];
    const decayRate = 0.005;
    function render() {
        analyser.getFloatFrequencyData(dataArray);
        gl!.viewport(0, 0, width, height);
        gl!.clearColor(0, 0, 0, 1);
        gl!.clear(gl!.COLOR_BUFFER_BIT);
        gl!.useProgram(programInfo.program);
        gl!.uniformMatrix4fv(programInfo.uniformLocations.projection, false, projectionMatrix);
        const barWidth = width / numberBars;
        let previousAvgDatabase = analyser.minDecibels;
        for (let index = 0; index < numberBars; index++) {
            const lowFreq = minFreq * ratio ** index;
            const highFreq = minFreq * ratio ** (index + 1);
            const lowIndex = Math.round((lowFreq * analyser.fftSize) / context.sampleRate);
            const highIndex = Math.round((highFreq * analyser.fftSize) / context.sampleRate);
            let sum = 0;
            let count = 0;
            for (let index_ = lowIndex; index_ < highIndex; index_++) {
                if (index_ < bufferLength) {
                    sum += dataArray[index_];
                    count++;
                }
            }
            const avgDatabase = count > 0 ? sum / count : previousAvgDatabase;
            let amplitude = map(avgDatabase, analyser.minDecibels, analyser.maxDecibels, 0, 1);
            amplitude = Math.max(0, Math.min(1, amplitude));
            amplitude **= 0.6;
            amplitude *= Math.min(1, currentRMS * 1.2);
            peaks[index] = amplitude > peaks[index] ? amplitude : Math.max(0, peaks[index] - decayRate);
            const barHeight = amplitude * height;
            const peakHeight = peaks[index] * height;
            const x = index * barWidth;
            const hue = map(index, 0, numberBars, 180, 360);
            const barRgb = hslToRgb(hue, 80, 50);
            drawRect(gl!, programInfo, positionBuffer!, x, height - barHeight, barWidth, barHeight, [...barRgb, 1]);
            if (peakHeight > barHeight) {
                drawLine(
                    gl!,
                    programInfo,
                    positionBuffer!,
                    x,
                    height - peakHeight,
                    x + barWidth,
                    height - peakHeight,
                    [1, 1, 1, 1],
                    2
                );
            }
            if (count > 0) {
                previousAvgDatabase = avgDatabase;
            }
        }
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

export async function createMeters(
    container: HTMLElement,
    gainNode: GainNodeLike,
    width: number = 450,
    height: number = 150
) {
    const { context } = gainNode;

    // 1. Подключаем AudioWorklet
    await context.audioWorklet!.addModule(processorUrl);
    const meterNode = new AudioWorkletNode!(context, 'meter-processor');
    gainNode.connect(meterNode);

    let currentRMS = 0;
    let currentPeak = 0;
    let currentLUFS = Number.NEGATIVE_INFINITY;

    meterNode.port.onmessage = e => {
        currentRMS = e.data.rms;
        currentPeak = e.data.peak;
        currentLUFS = e.data.lufs;
    };

    // 2. Настройка слоев WebGL и 2D Canvas
    const webglCanvas = document.createElement('canvas');
    webglCanvas.width = width;
    webglCanvas.height = height;

    const textCanvas = document.createElement('canvas');
    textCanvas.width = width;
    textCanvas.height = height;
    textCanvas.style.position = 'absolute';
    textCanvas.style.left = '0';
    textCanvas.style.top = '0';

    container.style.position = 'relative';
    container.append(webglCanvas);
    container.append(textCanvas);

    const gl = webglCanvas.getContext('webgl', { antialias: false });
    const ctx = textCanvas.getContext('2d');

    if (!gl || !ctx) {
        console.error('WebGL or Canvas 2D not supported');
        return;
    }

    // 3. Шейдеры (с поддержкой градиента OpenDAW)
    const vsSource = `
        attribute vec2 a_position;
        uniform mat4 u_projection;
        varying float v_y;
        void main() {
            gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
            v_y = a_position.y;
        }
    `;

    const fsSource = `
        precision mediump float;
        uniform vec4 u_color;
        uniform int u_mode;
        uniform float u_height;
        varying float v_y;

        void main() {
            if (u_mode == 2) {
                // Темный фон дорожки
                gl_FragColor = vec4(0.1, 0.1, 0.12, 1.0);
            } else if (u_mode == 1) {
                // Градиент от уровня громкости: Зеленый -> Желтый -> Красный
                float normY = 1.0 - (v_y / u_height);
                vec3 color = mix(vec3(0.1, 0.8, 0.4), vec3(0.9, 0.8, 0.1), smoothstep(0.6, 0.85, normY));
                color = mix(color, vec3(0.9, 0.2, 0.2), smoothstep(0.85, 0.95, normY));
                gl_FragColor = vec4(color, 1.0);
            } else {
                gl_FragColor = u_color;
            }
        }
    `;

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    if (!shaderProgram) return;

    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            position: gl.getAttribLocation(shaderProgram, 'a_position')
        },
        uniformLocations: {
            projection: gl.getUniformLocation(shaderProgram, 'u_projection'),
            color: gl.getUniformLocation(shaderProgram, 'u_color'),
            mode: gl.getUniformLocation(shaderProgram, 'u_mode'),
            height: gl.getUniformLocation(shaderProgram, 'u_height')
        }
    };

    const projectionMatrix = createOrthoMatrix(0, width, height, 0, -1, 1);
    const positionBuffer = gl.createBuffer();

    // 4. Параметры Layout'а
    const meterCount = 4;
    const paddingLeft = 40;
    const paddingBottom = 30;
    const paddingTop = 30; // Увеличили отступ сверху для лампочки клиппинга
    const maxBarHeight = height - paddingBottom - paddingTop;
    const trackWidth = ((width - paddingLeft) / meterCount) * 0.6;
    const gap = (width - paddingLeft) / meterCount;

    const labels = ['VU', 'PEAK', 'RMS', 'LUFS'];

    // Пики, баллистика и клиппинг
    const decayPerFrame = 1 / (0.4 * 60);
    const peaks: number[] = Array.from({ length: meterCount }).fill(0) as number[];
    const clipHolds: number[] = Array.from({ length: meterCount }).fill(0) as number[]; // Хранит метку времени (ms)
    const clipDuration = 2000; // Сколько миллисекунд горит индикатор перегруза

    let vuLevel = -60;
    const vuAttack = 0.3;
    const vuRelease = 0.3;

    function render() {
        const now = performance.now();

        gl!.viewport(0, 0, width, height);
        gl!.clearColor(0.05, 0.05, 0.05, 1);
        gl!.clear(gl!.COLOR_BUFFER_BIT);

        gl!.useProgram(programInfo.program);
        gl!.uniformMatrix4fv(programInfo.uniformLocations.projection, false, projectionMatrix);
        gl!.uniform1f(programInfo.uniformLocations.height, height);

        ctx!.clearRect(0, 0, width, height);
        ctx!.font = '300 10px "Inter", "Segoe UI", sans-serif';
        ctx!.textAlign = 'center';

        // --- 1. Отрисовка шкалы dB (Линии WebGL + Текст 2D) ---
        const marks = [0, -6, -12, -18, -24, -36, -48, -60];
        gl!.uniform1i(programInfo.uniformLocations.mode, 0);

        for (const dB of marks) {
            const y = map(dB, -60, 0, height - paddingBottom, paddingTop);

            const grayRgb = hslToRgb(0, 0, 20);
            drawLine(gl!, programInfo, positionBuffer!, paddingLeft - 10, y, width, y, [...grayRgb, 1], 1);

            ctx!.fillStyle = dB === 0 ? '#ff5555' : '#888888';
            ctx!.textBaseline = 'middle';
            ctx!.textAlign = 'right';
            ctx!.fillText(dB > 0 ? `+${dB}` : `${dB}`, paddingLeft - 15, y);
        }

        // --- 2. Расчет уровней ---
        const targetVU = 20 * Math.log10(currentRMS || 0.0001);
        vuLevel += (targetVU - vuLevel) * (1 - Math.exp(-1 / ((targetVU > vuLevel ? vuAttack : vuRelease) * 60)));

        const levels = [
            vuLevel,
            20 * Math.log10(currentPeak || 0.0001),
            20 * Math.log10(currentRMS || 0.0001),
            currentLUFS
        ];

        // --- 3. Отрисовка Метеров ---
        for (let i = 0; i < meterCount; i++) {
            const rawDB = levels[i];

            // Фиксируем клиппинг, если значение больше или равно 0 dB
            if (rawDB >= 0) {
                clipHolds[i] = now + clipDuration;
            }

            let dB = Math.max(-60, Math.min(0, rawDB));
            const norm = map(dB, -60, 0, 0, 1);
            const barHeight = norm * maxBarHeight;

            const x = paddingLeft + i * gap + (gap - trackWidth) / 2;
            const yBottom = height - paddingBottom;

            peaks[i] = norm > peaks[i] ? norm : Math.max(0, peaks[i] - decayPerFrame);
            const peakY = yBottom - peaks[i] * maxBarHeight;

            // Фон метера (Темный прямоугольник)
            gl!.uniform1i(programInfo.uniformLocations.mode, 2);
            drawRect(gl!, programInfo, positionBuffer!, x, paddingTop, trackWidth, maxBarHeight, [0, 0, 0, 1]);

            // Активный уровень (Градиент)
            gl!.uniform1i(programInfo.uniformLocations.mode, 1);
            drawRect(gl!, programInfo, positionBuffer!, x, yBottom - barHeight, trackWidth, barHeight, [1, 1, 1, 1]);

            // Линия Peak Hold (Сплошной белый)
            gl!.uniform1i(programInfo.uniformLocations.mode, 0);
            drawLine(gl!, programInfo, positionBuffer!, x, peakY, x + trackWidth, peakY, [1, 1, 1, 1], 2);

            // Текст под метером (Название)
            ctx!.fillStyle = '#aaaaaa';
            ctx!.textAlign = 'center';
            ctx!.textBaseline = 'top';
            ctx!.fillText(labels[i], x + trackWidth / 2, yBottom + 8);

            // --- Индикатор клиппинга (LED) ---
            const isClipping = now < clipHolds[i];
            ctx!.fillStyle = isClipping ? '#ff3333' : '#331111'; // Ярко-красный или темно-бордовый
            ctx!.fillRect(x, paddingTop - 8, trackWidth, 4);

            // Текст над метером (Точное значение)
            ctx!.fillStyle = isClipping ? '#ff5555' : '#ffffff';
            ctx!.textBaseline = 'bottom';
            // Поднимаем текст еще чуть выше, чтобы освободить место для LED индикатора
            ctx!.fillText(rawDB.toFixed(1), x + trackWidth / 2, paddingTop - 12);
        }

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

export async function createFrequencyCurveWithRMS(
    container: HTMLElement,
    gainNode: GainNodeLike,
    width: number = 600,
    height: number = 200
) {
    const { context } = gainNode;

    await context.audioWorklet!.addModule(processorUrl);
    const amplitudeNode: AudioWorkletNodeLike = new AudioWorkletNode!(context, 'meter-processor');
    gainNode.connect(amplitudeNode);

    const analyser = context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;
    gainNode.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    let currentRMS = 0;
    amplitudeNode.port.onmessage = e => {
        currentRMS = e.data.rms;
    };

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.append(canvas);

    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }

    const vsSource = `
        attribute vec2 a_position;
        uniform mat4 u_projection;
        varying float v_y;
        void main() {
            gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
            v_y = a_position.y;
        }
    `;

    const fsSource = `
        precision mediump float;
        uniform vec4 u_color;
        uniform float u_height;
        uniform int u_is_fill;
        varying float v_y;
        void main() {
            if (u_is_fill == 1) {
                float alpha = (v_y / u_height);
                gl_FragColor = vec4(u_color.rgb, u_color.a * alpha * 0.4);
            } else {
                gl_FragColor = u_color;
            }
        }
    `;

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    if (!shaderProgram) return;

    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            position: gl.getAttribLocation(shaderProgram, 'a_position')
        },
        uniformLocations: {
            projection: gl.getUniformLocation(shaderProgram, 'u_projection'),
            color: gl.getUniformLocation(shaderProgram, 'u_color'),
            height: gl.getUniformLocation(shaderProgram, 'u_height'),
            isFill: gl.getUniformLocation(shaderProgram, 'u_is_fill')
        }
    };

    const projectionMatrix = createOrthoMatrix(0, width, height, 0, -1, 1);

    const positionBuffer = gl.createBuffer();

    const numberPoints = width;
    const minFreq = 20;
    const maxFreq = context.sampleRate / 2;
    const logRatio = (maxFreq / minFreq) ** (1 / (numberPoints - 1));

    const lineVertices = new Float32Array(numberPoints * 2);
    const fillVertices = new Float32Array(numberPoints * 4);

    function render() {
        analyser.getFloatFrequencyData(dataArray);

        gl!.viewport(0, 0, width, height);
        gl!.clearColor(0, 0, 0, 0);
        gl!.clear(gl!.COLOR_BUFFER_BIT);

        gl!.useProgram(programInfo.program);
        gl!.uniformMatrix4fv(programInfo.uniformLocations.projection, false, projectionMatrix);
        gl!.uniform1f(programInfo.uniformLocations.height, height);

        for (let index = 0; index < numberPoints; index++) {
            const x = index;
            const freq = minFreq * logRatio ** index;

            const exactBin = (freq * analyser.fftSize) / context.sampleRate;
            const binLow = Math.floor(exactBin);
            const binHigh = Math.min(bufferLength - 1, binLow + 1);
            const fraction = exactBin - binLow;

            const databaseValue = dataArray[binLow] + (dataArray[binHigh] - dataArray[binLow]) * fraction;

            let amplitude = map(databaseValue, analyser.minDecibels, analyser.maxDecibels, 0, 1);
            amplitude = Math.max(0, Math.min(1, amplitude));
            amplitude **= 0.6;

            amplitude *= Math.min(1, currentRMS * 1.5 + 0.1);

            const y = height - amplitude * height;

            lineVertices[index * 2] = x;
            lineVertices[index * 2 + 1] = y;

            fillVertices[index * 4] = x;
            fillVertices[index * 4 + 1] = y;
            fillVertices[index * 4 + 2] = x;
            fillVertices[index * 4 + 3] = height;
        }

        gl!.bindBuffer(gl!.ARRAY_BUFFER, positionBuffer);
        gl!.enableVertexAttribArray(programInfo.attribLocations.position);
        gl!.vertexAttribPointer(programInfo.attribLocations.position, 2, gl!.FLOAT, false, 0, 0);

        const themeColor = [0.2, 0.8, 0.6, 0.6];

        gl!.bufferData(gl!.ARRAY_BUFFER, fillVertices, gl!.DYNAMIC_DRAW);
        gl!.uniform4fv(programInfo.uniformLocations.color, themeColor);
        gl!.uniform1i(programInfo.uniformLocations.isFill, 1);
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, numberPoints * 2);

        gl!.bufferData(gl!.ARRAY_BUFFER, lineVertices, gl!.DYNAMIC_DRAW);
        gl!.uniform4fv(programInfo.uniformLocations.color, themeColor);
        gl!.uniform1i(programInfo.uniformLocations.isFill, 0);
        gl!.lineWidth(2);
        gl!.drawArrays(gl!.LINE_STRIP, 0, numberPoints);

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}
