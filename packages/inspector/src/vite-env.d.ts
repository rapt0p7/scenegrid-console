/// <reference types="vite/client" />

declare global {}

declare module '*?worklet' {
    const url: string;
    export default url;
}
