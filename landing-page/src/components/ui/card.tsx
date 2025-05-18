import React from 'react';
import classNames from 'classnames';

type CardProps = {
	children: React.ReactNode;
	className?: string;
};

export const Card: React.FC<CardProps> = ({ children, className }) => {
	return (
		<div
			className={classNames('bg-white shadow-md rounded-lg p-4', className)}
			style={{ borderColor: 'var(--secondary-color)', borderWidth: '1px' }}
		>
			{children}
		</div>
	);
};