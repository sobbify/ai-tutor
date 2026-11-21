import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonClass, type ButtonStyleProps } from './buttonClass';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />;
});

export function ButtonLink({ variant, size, block, className, viewTransition = true, ...rest }: LinkProps & ButtonStyleProps) {
  return <Link viewTransition={viewTransition} className={buttonClass({ variant, size, block }, className)} {...rest} />;
}
