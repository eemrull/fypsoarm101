"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ScsServoSDK } from "feetech.js";

// Singleton instance
const globalScsServoSDK = new ScsServoSDK();

interface MotorBusContextType {
  scsServoSDK: ScsServoSDK;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const MotorBusContext = createContext<MotorBusContextType>({
  scsServoSDK: globalScsServoSDK,
  isConnected: false,
  connect: async () => {},
  disconnect: async () => {},
});

export const useMotorBus = () => useContext(MotorBusContext);

export function MotorBusProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const serialCapable =
    typeof navigator !== "undefined" &&
    "serial" in (navigator as Navigator & { serial?: unknown });

  const connect = async () => {
    if (!serialCapable) {
      alert(
        "Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera to connect to the hardware.",
      );
      return;
    }
    try {
      await globalScsServoSDK.connect();
      setIsConnected(true);
    } catch (err: unknown) {
      setIsConnected(false);
      console.error(err);
      throw err; // Re-throw so consumers can handle it if they want
    }
  };

  const disconnect = async () => {
    try {
      await globalScsServoSDK.disconnect();
      setIsConnected(false);
    } catch (err: unknown) {
      console.error("Failed to disconnect", err);
      throw err;
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // It's generally safer to not auto-disconnect on unmount in React 18 strict mode
      // because it double-fires, but we'll disconnect if we leave the provider entirely.
      if (isConnected) {
        globalScsServoSDK.disconnect().catch(console.error);
      }
    };
  }, [isConnected]);

  return (
    <MotorBusContext.Provider
      value={{
        scsServoSDK: globalScsServoSDK,
        isConnected,
        connect,
        disconnect,
      }}
    >
      {children}
    </MotorBusContext.Provider>
  );
}
