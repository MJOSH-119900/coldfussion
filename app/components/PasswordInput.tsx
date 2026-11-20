'use client';

import { useState, type InputHTMLAttributes } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    wrapperClassName?: string;
    toggleClassName?: string;
};

export default function PasswordInput({
    wrapperClassName = '',
    toggleClassName = '',
    className = '',
    ...inputProps
}: PasswordInputProps) {
    const [visible, setVisible] = useState(false);

    return (
        <div className={`relative ${wrapperClassName}`}>
            <input {...inputProps} type={visible ? 'text' : 'password'} className={`${className} pr-20`} />
            <button
                type="button"
                onClick={() => setVisible(current => !current)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                className={`absolute inset-y-0 right-3 my-auto h-fit rounded px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 ${toggleClassName}`}
            >
                {visible ? 'Hide' : 'Show'}
            </button>
        </div>
    );
}
