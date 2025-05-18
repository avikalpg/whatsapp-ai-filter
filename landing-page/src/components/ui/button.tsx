import React from 'react';
import classNames from 'classnames';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	className?: string;
};

export const Button: React.FC<ButtonProps> = ({ children, className, ...props }) => {
	return (
		<button
			className={classNames(
				'px-4 py-2 font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2',
				className
			)}
			style={{ background: 'var(--secondary-color)', color: 'white' }}
			{...props}
		>
			{children}
		</button>
	);
};