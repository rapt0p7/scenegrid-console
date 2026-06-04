type Builtin = string | number | boolean | bigint | symbol | undefined | null | Function | Date | Error | RegExp;

export type DeepReadonly<T> = T extends Builtin
    ? T
    : T extends Map<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends ReadonlyMap<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends Promise<infer U>
              ? Promise<DeepReadonly<U>>
              : T extends object
                ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                : Readonly<T>;
