import NetInfo from "@react-native-community/netinfo";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fireReconnect } from "./onReconnect";

type NetworkState = { isConnected: boolean };

const NetworkCtx = createContext<NetworkState>({ isConnected: true });

/**
 * Wraps NetInfo's `addEventListener` and exposes `{ isConnected }`
 * to the tree. Defaults to `true` (assume online until proven
 * otherwise) to avoid a flash-of-offline on cold start.
 *
 * When transitioning from offline → online, fires all reconnect
 * subscribers registered via `onReconnect.ts`.
 */
export function NetworkProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isConnected, setIsConnected] = useState(true);
  const prevConnected = useRef(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? true;
      setIsConnected(connected);

      // Fire reconnect listeners on offline → online transition.
      if (connected && !prevConnected.current) {
        fireReconnect();
      }
      prevConnected.current = connected;
    });

    return unsubscribe;
  }, []);

  return (
    <NetworkCtx.Provider value={{ isConnected }}>
      {children}
    </NetworkCtx.Provider>
  );
}

/**
 * Returns `{ isConnected }` — true when the device has network
 * connectivity, false otherwise.
 */
export function useNetwork(): NetworkState {
  return useContext(NetworkCtx);
}
