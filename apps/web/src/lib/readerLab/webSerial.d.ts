export {}

declare global {
  interface SerialPortInfo {
    usbVendorId?: number
    usbProductId?: number
  }

  interface SerialOptions {
    baudRate: number
    dataBits?: 7 | 8
    stopBits?: 1 | 2
    parity?: 'none' | 'even' | 'odd'
    flowControl?: 'none' | 'hardware'
    bufferSize?: number
  }

  interface SerialPort extends EventTarget {
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null
    open(options: SerialOptions): Promise<void>
    close(): Promise<void>
    getInfo(): SerialPortInfo
    addEventListener(
      type: 'connect' | 'disconnect',
      listener: (ev: Event) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: 'connect' | 'disconnect',
      listener: (ev: Event) => void,
      options?: boolean | EventListenerOptions,
    ): void
  }

  interface SerialPortEvent extends Event {
    port: SerialPort
  }

  interface Serial extends EventTarget {
    requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
    addEventListener(
      type: 'connect' | 'disconnect',
      listener: (ev: SerialPortEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    removeEventListener(
      type: 'connect' | 'disconnect',
      listener: (ev: SerialPortEvent) => void,
      options?: boolean | EventListenerOptions,
    ): void
  }

  interface Navigator {
    serial?: Serial
  }
}
