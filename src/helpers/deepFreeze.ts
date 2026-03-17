function deepFreeze<T extends object>(object: T): Readonly<T> {
    const propertyNames = Object.getOwnPropertyNames(object);

    for (const name of propertyNames) {
        const value = (object as any)[name];

        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    }

    return Object.freeze<T>(object);
}

export default deepFreeze;
