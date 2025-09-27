'use client'

import React from 'react';
import classNames from 'classnames';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	className?: string;
	variant?: ButtonVariant;
	style?: React.CSSProperties;
};

export const Button: React.FC<ButtonProps> = ({
	children,
	className,
	variant = 'primary',
	style: propStyle,
	...props
}) => {
	const getVariantStyles = () => {
		switch (variant) {
			case 'primary':
				return {
					background: 'var(--secondary-color)',
					color: 'white',
					border: 'none',
					focusRing: 'focus:ring-white'
				};
			case 'secondary':
				return {
					background: 'transparent',
					color: 'var(--secondary-color)',
					border: '2px solid var(--secondary-color)',
					focusRing: 'focus:ring-gray-300'
				};
			default:
				return {
					background: 'var(--secondary-color)',
					color: 'white',
					border: 'none',
					focusRing: 'focus:ring-white'
				};
		}
	};

	const variantStyles = getVariantStyles();

	return (
		<button
			className={classNames(
				'px-4 py-2 font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200',
				variantStyles.focusRing,
				className
			)}
			style={{
				background: variantStyles.background,
				color: variantStyles.color,
				border: variantStyles.border,
				...propStyle
			}}
			{...props}
		>
			{children}
		</button>
	);
};